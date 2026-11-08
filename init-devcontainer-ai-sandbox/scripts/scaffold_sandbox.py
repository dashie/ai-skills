#!/usr/bin/env python3
"""Render the AI dev-container sandbox into a repository.

Deterministic: templates are copied and placeholders substituted. Idempotent: doc
snippets are appended between markers only when the markers are absent.
"""

import argparse
import json
import os
import re
import stat
import sys

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_ROOT = os.path.join(SKILL_ROOT, "assets", "templates")
SNIPPET_ROOT = os.path.join(SKILL_ROOT, "assets", "snippets")

PLACEHOLDER = re.compile(r"\{\{([A-Z0-9_]+)\}\}")
BEGIN_MARKER = "<!-- BEGIN agent-sandbox -->"
END_MARKER = "<!-- END agent-sandbox -->"
GITIGNORE_ENTRY = ".agent/logs/"

# template -> (destination, executable)
TARGETS = [
    ("devcontainer.json", ".devcontainer/devcontainer.json", False),
    ("Dockerfile", ".devcontainer/Dockerfile", False),
    ("stack-tools.sh", ".devcontainer/stack-tools.sh", True),
    ("post-create.sh", ".devcontainer/post-create.sh", True),
    ("git-guard.sh", ".devcontainer/git-guard.sh", True),
    ("run.sh", ".agent/run.sh", True),
    ("goal.md", ".agent/goal.md", False),
    ("docs/AGENT-SANDBOX.md", "docs/AGENT-SANDBOX.md", False),
]

# destination document -> snippet, plus the heading used when the file is created
APPEND_TARGETS = [
    ("AGENTS.md", "agents-append.md", "# {project} - Agent Instructions"),
    ("docs/DEVELOPER-GUIDE.md", "developer-guide-append.md", "# Developer Guide - {project}"),
]


def fail(message):
    sys.stderr.write("error: %s\n" % message)
    raise SystemExit(1)


def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def write(path, content, mode=0o644):
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    os.chmod(path, mode)


def load_template(name):
    path = os.path.join(TEMPLATE_ROOT, name)
    if not os.path.isfile(path):
        fail("missing template: %s" % path)
    return read(path)


def build_variable_map():
    usage = {}
    for name, _, _ in TARGETS:
        for key in PLACEHOLDER.findall(load_template(name)):
            usage.setdefault(key, []).append(name)
    return usage


def load_values(values_path):
    if not os.path.isfile(values_path):
        fail("values file not found: %s" % values_path)
    try:
        data = json.loads(read(values_path))
    except ValueError as error:
        fail("values file is not valid JSON: %s" % error)
    if not isinstance(data, dict):
        fail("values file must contain a JSON object")
    values = {}
    for key, value in data.items():
        if isinstance(value, list):
            value = "\n".join(str(item) for item in value)
        if not isinstance(value, str):
            fail("value for %s must be a string" % key)
        if not value.strip():
            fail("value for %s is empty" % key)
        values[key] = value
    return values


def render(name, values, usage):
    template = load_template(name)
    required = set(PLACEHOLDER.findall(template))
    missing = sorted(key for key in required if key not in values)
    if missing:
        sources = sorted({src for key in missing for src in usage.get(key, [])})
        fail(
            "missing values for %s: %s (used in %s)"
            % (name, ", ".join(missing), ", ".join(sources))
        )
    rendered = template
    for key in sorted(required):
        rendered = rendered.replace("{{%s}}" % key, values[key])
    leftover = PLACEHOLDER.findall(rendered)
    if leftover:
        fail("unresolved placeholders in %s: %s" % (name, ", ".join(sorted(set(leftover)))))
    if not rendered.endswith("\n"):
        rendered += "\n"
    return rendered


def append_block(path, snippet_name, heading, values, dry_run):
    """Append the snippet when its markers are absent. Returns a status string."""
    marker_text = BEGIN_MARKER + "\n" + END_MARKER

    def prefix_for(existing):
        body = existing.rstrip("\n")
        if body:
            # Existing document: append only, never add a second title.
            return body + "\n\n"
        return heading.format(project=values["PROJECT_NAME"]) + "\n\n"

    if os.path.exists(path):
        content = read(path)
        if BEGIN_MARKER in content:
            return "unchanged"
        if END_MARKER in content and BEGIN_MARKER not in content:
            fail("%s contains the end marker without the begin marker; fix it by hand" % path)
        prefix = prefix_for(content)
        mode = stat.S_IMODE(os.stat(path).st_mode)
    else:
        prefix = prefix_for("")
        mode = 0o644

    snippet = read(os.path.join(SNIPPET_ROOT, snippet_name)).rstrip("\n") + "\n"
    if dry_run:
        return "would append"
    write(path, prefix + snippet, mode)
    return "appended"


def ensure_gitignore(root, dry_run):
    path = os.path.join(root, ".gitignore")
    entry = GITIGNORE_ENTRY
    if os.path.exists(path):
        content = read(path)
        if any(line.strip() == entry for line in content.splitlines()):
            return "unchanged"
        new_content = content
        if not new_content.endswith("\n"):
            new_content += "\n"
        new_content += "\n# AI sandbox run logs\n" + entry + "\n"
        if not dry_run:
            write(path, new_content, stat.S_IMODE(os.stat(path).st_mode))
        return "updated"
    if not dry_run:
        write(path, "# AI sandbox run logs\n" + entry + "\n")
    return "created"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Render the AI dev-container sandbox.")
    parser.add_argument("--dest", help="repository root")
    parser.add_argument("--values", help="JSON file with one value per placeholder")
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    parser.add_argument("--dry-run", action="store_true", help="report, do not write")
    parser.add_argument("--list-variables", action="store_true", help="print the placeholder contract")
    args = parser.parse_args(argv)

    usage = build_variable_map()

    if args.list_variables:
        for key in sorted(usage):
            print("%-24s %s" % (key, ", ".join(usage[key])))
        return 0

    if not args.dest or not args.values:
        parser.error("--dest and --values are required")

    values = load_values(args.values)
    unknown = sorted(set(values) - set(usage))
    if unknown:
        sys.stderr.write("warning: unused values: %s\n" % ", ".join(unknown))

    root = os.path.abspath(args.dest)
    if os.path.exists(root) and not os.path.isdir(root):
        fail("destination is not a directory: %s" % root)

    rendered = [(destination, render(name, values, usage), executable) for name, destination, executable in TARGETS]

    existing = [
        os.path.join(root, destination)
        for destination, _, _ in rendered
        if os.path.exists(os.path.join(root, destination))
    ]
    if existing and not args.force:
        fail(
            "refusing to overwrite existing files (use --force only with user approval):\n  "
            + "\n  ".join(existing)
        )

    for destination, content, executable in rendered:
        target = os.path.join(root, destination)
        if args.dry_run:
            print("would write %s (%d bytes)" % (target, len(content.encode("utf-8"))))
            continue
        write(target, content, 0o755 if executable else 0o644)
        print("wrote %s" % target)

    for destination, snippet_name, heading in APPEND_TARGETS:
        status = append_block(os.path.join(root, destination), snippet_name, heading, values, args.dry_run)
        print("%s %s" % (status, destination))

    status = ensure_gitignore(root, args.dry_run)
    print("%s .gitignore (%s)" % (status, GITIGNORE_ENTRY))
    return 0


if __name__ == "__main__":
    sys.exit(main())
