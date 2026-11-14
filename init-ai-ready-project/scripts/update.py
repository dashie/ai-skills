#!/usr/bin/env python3
"""Bring an already initialized repository up to the current skill standard.

The templates own a set of fixed blocks. Every block is delimited in the template by

    <!-- skill:block:<id> [attrs] -->
    ...
    <!-- skill:end:<id> -->

Attributes steer insertion when the target has no marker yet, which is the case for a
repository initialized by an older version of the skill:

    before="<heading>"    insert the block before that heading line
    section="<heading>"   insert the block at the end of that section
    replace="body"        replace everything after the first level-1 heading

Blocks that the current templates no longer contain are removed from the target when
they are still marked. Updating is idempotent: a second run reports no changes.
"""

import argparse
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(os.path.dirname(SCRIPT_DIR), "assets", "templates")

sys.path.insert(0, SCRIPT_DIR)
import scaffold  # noqa: E402  (sibling script: shares the settings merge logic)

BLOCK = re.compile(
    r"<!-- skill:block:(?P<id>[a-z0-9-]+)(?P<attrs>[^\n>]*)-->\n"
    r"(?P<body>.*?)"
    r"<!-- skill:end:(?P=id) -->\n",
    re.S,
)
ATTR = re.compile(r'([a-z]+)="([^"]*)"')
BEGIN = re.compile(r"<!-- skill:block:([a-z0-9-]+)[^\n>]*-->")
END = re.compile(r"<!-- skill:end:([a-z0-9-]+) -->")
HEADING = re.compile(r"^(#{1,6}) ")
TITLE = re.compile(r"^# ")


def region_re(block_id):
    return re.compile(
        r"<!-- skill:block:" + re.escape(block_id) + r"[^\n>]*-->\n"
        r".*?<!-- skill:end:" + re.escape(block_id) + r" -->\n",
        re.S,
    )


def template_files():
    names = []
    for name in sorted(os.listdir(TEMPLATES)):
        if name.endswith(".md"):
            names.append(name)
    for sub in ("docs", ".github"):
        folder = os.path.join(TEMPLATES, sub)
        if os.path.isdir(folder):
            for name in sorted(os.listdir(folder)):
                if name.endswith(".md"):
                    names.append(sub + "/" + name)
    return names


def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def load_blocks():
    """Return {relative path: [block, ...]} for every marked template block."""
    blocks = {}
    for name in template_files():
        text = read(os.path.join(TEMPLATES, name))
        found = []
        for match in BLOCK.finditer(text):
            attrs = dict(ATTR.findall(match.group("attrs")))
            found.append(
                {
                    "id": match.group("id"),
                    "attrs": attrs,
                    "body": match.group("body"),
                    "region": match.group(0),
                }
            )
        if found:
            blocks[name] = found
    return blocks


def validate_templates(blocks):
    problems = []
    for name in template_files():
        text = read(os.path.join(TEMPLATES, name))
        begins = BEGIN.findall(text)
        ends = END.findall(text)
        if sorted(begins) != sorted(ends):
            problems.append("unbalanced markers in template %s" % name)
        if len(begins) != len(set(begins)):
            problems.append("duplicate block id in template %s" % name)
    for name, found in blocks.items():
        for block in found:
            if not block["body"].strip():
                problems.append("empty block %s in template %s" % (block["id"], name))
            if "{{" in block["body"]:
                problems.append(
                    "placeholder inside managed block %s in template %s"
                    % (block["id"], name)
                )
    return problems


def line_index(text, heading):
    """Index of the line equal to `heading`, or None."""
    for index, line in enumerate(text.splitlines()):
        if line.rstrip() == heading:
            return index
    return None


def offset_of_line(text, index):
    pos = 0
    for number, line in enumerate(text.splitlines(keepends=True)):
        if number == index:
            return pos
        pos += len(line)
    return pos


def section_end_offset(text, heading):
    """Offset of the first heading that closes the `heading` section, or EOF."""
    lines = text.splitlines(keepends=True)
    start = None
    level = None
    for number, line in enumerate(lines):
        if line.rstrip() == heading:
            start = number
            level = len(HEADING.match(heading).group(1))
            break
    if start is None:
        return None
    for number in range(start + 1, len(lines)):
        match = HEADING.match(lines[number])
        if match and len(match.group(1)) <= level:
            return sum(len(line) for line in lines[:number])
    return len(text)


def replace_section(text, heading, region):
    lines = text.splitlines(keepends=True)
    start = None
    level = None
    for number, line in enumerate(lines):
        if line.rstrip() == heading:
            start = number
            level = len(HEADING.match(heading).group(1))
            break
    if start is None:
        return None
    end = len(lines)
    for number in range(start + 1, len(lines)):
        match = HEADING.match(lines[number])
        if match and len(match.group(1)) <= level:
            end = number
            break
    # Comment lines directly above the closing heading belong to the next section:
    # they are often block markers (<!-- BEGIN ... -->) of another tool. Leaving them
    # inside the replaced region would silently delete them.
    probe = end
    while probe > start + 1:
        stripped = lines[probe - 1].strip()
        if stripped == "" or (stripped.startswith("<!--") and stripped.endswith("-->")):
            probe -= 1
        else:
            break
    if probe < end and any(
        lines[index].strip().startswith("<!--") for index in range(probe, end)
    ):
        end = probe
    head = "".join(lines[:start])
    tail = "".join(lines[end:])
    if head and not head.endswith("\n\n"):
        head = head.rstrip("\n") + "\n\n"
    if tail and not region.endswith("\n\n"):
        region = region.rstrip("\n") + "\n\n"
    return head + region + tail


def replace_body(text, region):
    lines = text.splitlines(keepends=True)
    for number, line in enumerate(lines):
        if TITLE.match(line):
            head = "".join(lines[: number + 1]).rstrip("\n") + "\n\n"
            return head + region
    return None


def insert_at(text, offset, region):
    head, tail = text[:offset], text[offset:]
    if head and not head.endswith("\n\n"):
        head = head.rstrip("\n") + "\n\n"
    if tail and not region.endswith("\n\n"):
        region = region.rstrip("\n") + "\n\n"
    return head + region + tail


def insert_block(text, block):
    """Insert an unmarked block, returning (new text, action) or (None, problem)."""
    body = block["body"]
    if body.strip() and body in text:
        return text.replace(body, block["region"].strip("\n") + "\n", 1), "adopted"

    heading = None
    for line in body.splitlines():
        if line.strip():
            heading = line.rstrip() if HEADING.match(line) else None
            break
    if heading and line_index(text, heading) is not None:
        return replace_section(text, heading, block["region"]), "adopted"

    if block["attrs"].get("replace") == "body":
        new = replace_body(text, block["region"])
        if new is not None:
            return new, "adopted"
        return None, 'no level-1 heading to replace in the target'

    anchor = block["attrs"].get("before")
    if anchor:
        index = line_index(text, anchor)
        if index is not None:
            return insert_at(text, offset_of_line(text, index), block["region"]), "inserted"
        return None, "anchor heading %r not found" % anchor

    section = block["attrs"].get("section")
    if section:
        offset = section_end_offset(text, section)
        if offset is not None:
            return insert_at(text, offset, block["region"]), "inserted"
        return None, "anchor section %r not found" % section

    return text + block["region"], "appended"


def update_text(text, blocks):
    actions = []
    problems = []
    for block in blocks:
        matcher = region_re(block["id"])
        if matcher.search(text):
            new = matcher.sub(lambda _match: block["region"], text, count=1)
            actions.append((block["id"], "updated" if new != text else "unchanged"))
            text = new
            continue
        new, outcome = insert_block(text, block)
        if new is None:
            problems.append("%s: %s" % (block["id"], outcome))
            continue
        actions.append((block["id"], outcome))
        text = new
    return text, actions, problems


def drop_stale(text, keep):
    """Remove marked blocks whose id is not part of the current standard."""
    removed = []
    while True:
        match = next(
            (item for item in BLOCK.finditer(text) if item.group("id") not in keep),
            None,
        )
        if match is None:
            return text, removed
        removed.append(match.group("id"))
        head, tail = text[: match.start()], text[match.end():]
        if not head.strip():
            text = tail.lstrip("\n")
        elif not tail.strip():
            text = head.rstrip("\n") + "\n"
        else:
            text = head.rstrip("\n") + "\n\n" + tail.lstrip("\n")


def is_fully_managed(text):
    """True when a template is nothing but managed blocks and blank lines.

    Such a file carries no project content and no placeholder, so it can be created
    from the template as-is when it is missing.
    """
    if "{{" in text:
        return False
    return BLOCK.sub("", text).strip() == ""


def create_from_template(path, text):
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Update an initialized repository to the current skill standard."
    )
    parser.add_argument("--dest", required=True, help="repository directory")
    parser.add_argument(
        "--dry-run", action="store_true", help="report the changes without writing"
    )
    args = parser.parse_args(argv)

    root = os.path.abspath(args.dest)
    blocks = load_blocks()

    problems = validate_templates(blocks)
    if problems:
        for problem in problems:
            sys.stderr.write("error: %s\n" % problem)
        return 1

    rows = []
    errors = []
    changed = []

    for name in sorted(blocks):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            template_text = read(os.path.join(TEMPLATES, name))
            if not is_fully_managed(template_text):
                errors.append(
                    "missing file %s: it holds project content, so it is never created "
                    "automatically; copy assets/templates/%s from the skill, fill in its "
                    "placeholders, then re-run update" % (name, name)
                )
                continue
            if not args.dry_run:
                create_from_template(path, template_text)
            rows.append((name, "-", "created"))
            if not args.dry_run:
                changed.append(name)
            continue

        original = read(path)
        text, actions, block_problems = update_text(original, blocks[name])
        text, removed = drop_stale(text, {block["id"] for block in blocks[name]})

        for block_id, action in actions:
            rows.append((name, block_id, action))
        for block_id in removed:
            rows.append((name, block_id, "removed"))
        for problem in block_problems:
            errors.append("%s: %s" % (name, problem))

        if text != original:
            changed.append(name)
            if not args.dry_run:
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(text)

    settings_status = scaffold.render_settings(root, args.dry_run)
    if settings_status != "unchanged":
        verb = ("would " + settings_status) if args.dry_run else settings_status
        print("%s %s" % (verb, scaffold.SETTINGS_DESTINATION))
        if not args.dry_run:
            changed.append(scaffold.SETTINGS_DESTINATION)

    for name, block_id, action in rows:
        if action == "unchanged":
            continue
        prefix = "would " if args.dry_run and action != "unchanged" else ""
        print("%-9s %-28s %s" % (prefix + action, name, block_id))

    for error in errors:
        sys.stderr.write("error: %s\n" % error)

    if errors:
        return 1

    if not changed:
        print("baseline OK: %s already matches the current standard" % root)
        return 0

    verb = "would change" if args.dry_run else "changed"
    print("%s %d file(s) in %s" % (verb, len(changed), root))
    return 0


if __name__ == "__main__":
    sys.exit(main())
