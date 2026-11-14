#!/usr/bin/env python3
"""Verify a rendered scaffold: required files, no placeholders, working links,
and the fixed sections that must survive rendering."""

import argparse
import json
import os
import re
import sys

REQUIRED_FILES = [
    "README.md",
    "CONTRIBUTING.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".gitignore",
    ".github/copilot-commit-message-instructions.md",
    ".github/copilot-pull-request-instructions.md",
    ".vscode/settings.json",
    "docs/PRODUCT.md",
    "docs/USER-GUIDE.md",
    "docs/ARCHITECTURE.md",
    "docs/ADR.md",
    "docs/GLOSSARY.md",
    "docs/DEVELOPER-GUIDE.md",
]

FIXED_CONTENT = {
    "docs/DEVELOPER-GUIDE.md": [
        "## Git Standards",
        "Conventional Commits",
        "English",
        "agents never commit or push",
        "### Design rules",
        "ships with the tests of the part it changes",
        "### Commit messages",
        ".github/copilot-commit-message-instructions.md",
    ],
    "docs/USER-GUIDE.md": [
        "## How to use it",
        "## Configuration",
        "Keeping this guide current",
        "living document",
        "configuration option",
    ],
    "docs/ARCHITECTURE.md": [
        "### Architecture principles",
        "Simplicity first (KISS)",
        "Modular by default",
    ],
    "AGENTS.md": [
        "English only",
        "Conventional Commits",
        "docs/GLOSSARY.md",
        "Never commit or push",
        "## Engineering principles",
        "Simplicity first (KISS)",
        "Modularity and decoupling",
        "Tests ship with the change",
    ],
    "CONTRIBUTING.md": [
        "includes the tests of the code it touches",
        ".github/copilot-commit-message-instructions.md",
    ],
    ".github/copilot-commit-message-instructions.md": [
        "Conventional Commits",
        "<type>[optional scope][!]: <subject>",
        "BREAKING CHANGE:",
        "Co-authored-by:",
        "English",
    ],
    ".github/copilot-pull-request-instructions.md": [
        "Conventional Commits",
        "Closes #",
        "English",
    ],
    "CLAUDE.md": ["@AGENTS.md"],
}

LINK = re.compile(r"\]\(([^)\s]+)\)")
PLACEHOLDER = re.compile(r"\{\{[A-Z0-9_]+\}\}")
BLOCK_BEGIN = re.compile(r"<!-- skill:block:([a-z0-9-]+)[^\n>]*-->")
BLOCK_END = re.compile(r"<!-- skill:end:([a-z0-9-]+) -->")
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
TABLE_SEPARATOR = re.compile(r"^\s*\|(\s*:?-+:?\s*\|)+\s*$")
CODE_FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^(#{1,6})\s")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)

USER_GUIDE_SUMMARY_HEADING = "## What it is"
USER_GUIDE_SUMMARY_MAX_LINES = 3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(os.path.dirname(SCRIPT_DIR), "assets", "templates")


def template_block_ids():
    """{relative path: [block id, ...]} declared by the templates."""
    names = [name for name in sorted(os.listdir(TEMPLATES)) if name.endswith(".md")]
    docs = os.path.join(TEMPLATES, "docs")
    if os.path.isdir(docs):
        names.extend(
            "docs/" + name for name in sorted(os.listdir(docs)) if name.endswith(".md")
        )
    declared = {}
    for name in names:
        with open(os.path.join(TEMPLATES, name), "r", encoding="utf-8") as handle:
            text = handle.read()
        ids = BLOCK_BEGIN.findall(text)
        if ids:
            declared[name] = ids
    return declared


def check_tables(name, text):
    """Every Markdown table block needs a header separator row.

    Without it the renderer emits the rows as a single paragraph of literal pipes,
    which is how a headerless table slips into a scaffold unnoticed.
    Returns a list of problems.
    """
    problems = []
    in_fence = False
    block = []

    def flush():
        if block and not any(TABLE_SEPARATOR.match(line) for _, line in block):
            line_number = block[0][0]
            problems.append(
                "%s:%d: table block has no header separator row "
                "(Markdown renders it as text): %s"
                % (name, line_number, block[0][1].strip()[:60])
            )
        del block[:]

    for line_number, line in enumerate(text.splitlines(), start=1):
        if CODE_FENCE.match(line):
            flush()
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if TABLE_ROW.match(line):
            block.append((line_number, line))
        else:
            flush()
    flush()
    return problems


def section_body(text, heading):
    """Lines of the section that starts at `heading`, comments removed.

    Returns None when the heading is absent. The section ends at the next heading of
    the same or a higher level.
    """
    text = HTML_COMMENT.sub("", text)
    lines = text.splitlines()
    start = None
    level = None
    for index, line in enumerate(lines):
        if line.rstrip() == heading:
            start = index
            level = len(HEADING.match(heading).group(1))
            break
    if start is None:
        return None
    body = []
    for line in lines[start + 1:]:
        match = HEADING.match(line)
        if match and len(match.group(1)) <= level:
            break
        body.append(line)
    return body


def check_user_guide(name, text):
    """`What it is` is one short paragraph, and the guide stands alone.

    The guide is distributed on its own, so a link to another repository document makes
    the standalone copy broken.
    """
    problems = []
    for target in relative_links(text):
        problems.append(
            "%s: links to %s, but this guide is distributed on its own and must not "
            "reference other repository documents" % (name, target)
        )

    body = section_body(text, USER_GUIDE_SUMMARY_HEADING)
    if body is None:
        problems.append("%s: missing %s section" % (name, USER_GUIDE_SUMMARY_HEADING))
        return problems

    paragraphs = []
    current = []
    in_fence = False
    for line in body:
        if CODE_FENCE.match(line):
            in_fence = not in_fence
        elif not in_fence and not line.strip():
            if current:
                paragraphs.append(current)
                current = []
            continue
        current.append(line)
    if current:
        paragraphs.append(current)

    if len(paragraphs) != 1:
        problems.append(
            "%s: %s must be a single paragraph (found %d)"
            % (name, USER_GUIDE_SUMMARY_HEADING, len(paragraphs))
        )
        return problems
    if len(paragraphs[0]) > USER_GUIDE_SUMMARY_MAX_LINES:
        problems.append(
            "%s: the summary under %s is %d lines long, the maximum is %d"
            % (
                name,
                USER_GUIDE_SUMMARY_HEADING,
                len(paragraphs[0]),
                USER_GUIDE_SUMMARY_MAX_LINES,
            )
        )
    return problems


def relative_links(text):
    for target in LINK.findall(text):
        if target.startswith(("#", "http://", "https://", "mailto:", "}")):
            continue
        yield target.split("#", 1)[0]



GENERATOR_SETTINGS = {
    "github.copilot.chat.commitMessageGeneration.instructions":
        ".github/copilot-commit-message-instructions.md",
    "github.copilot.chat.pullRequestDescriptionGeneration.instructions":
        ".github/copilot-pull-request-instructions.md",
}


def check_settings(root):
    """The two generator settings must exist and point at files that exist.

    Returns (errors, warnings). A setting the project deliberately rewired is a
    warning, not a failure: the repository owns its editor configuration.
    """
    errors = []
    warnings = []
    path = os.path.join(root, ".vscode/settings.json")
    if not os.path.isfile(path):
        return errors, warnings
    try:
        with open(path, "r", encoding="utf-8") as handle:
            settings = json.load(handle)
    except ValueError:
        warnings.append(
            ".vscode/settings.json is not plain JSON (comments?), generator "
            "settings not verified"
        )
        return errors, warnings
    if not isinstance(settings, dict):
        errors.append(".vscode/settings.json is not a JSON object")
        return errors, warnings

    for key, expected in GENERATOR_SETTINGS.items():
        entries = settings.get(key)
        if entries is None:
            errors.append(".vscode/settings.json is missing %s" % key)
            continue
        if not isinstance(entries, list):
            errors.append("%s must be an array of {file} or {text} objects" % key)
            continue
        files = [entry.get("file") for entry in entries if isinstance(entry, dict)]
        if expected not in files:
            warnings.append(
                "%s does not reference %s; the generated standard is not active"
                % (key, expected)
            )
        for relative in files:
            if relative and not os.path.isfile(os.path.join(root, relative)):
                errors.append("%s references a missing file: %s" % (key, relative))
    return errors, warnings


def main(argv=None):
    parser = argparse.ArgumentParser(description="Verify a rendered scaffold.")
    parser.add_argument("--dest", required=True, help="scaffold directory")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.dest)
    problems = []

    for name in REQUIRED_FILES:
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            problems.append("missing file: %s" % name)
        elif os.path.getsize(path) == 0:
            problems.append("empty file: %s" % name)

    for name in REQUIRED_FILES:
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
        for match in PLACEHOLDER.findall(text):
            problems.append("unresolved placeholder %s in %s" % (match, name))
        if name.endswith(".md"):
            problems.extend(check_tables(name, text))
            for target in relative_links(text):
                resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
                if not os.path.exists(resolved):
                    problems.append("broken link %s in %s" % (target, name))
        if name == "docs/USER-GUIDE.md":
            problems.extend(check_user_guide(name, text))
        for needle in FIXED_CONTENT.get(name, []):
            if needle not in text:
                problems.append("missing fixed content %r in %s" % (needle, name))

    for name, block_ids in template_block_ids().items():
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
        begins = BLOCK_BEGIN.findall(text)
        ends = BLOCK_END.findall(text)
        for block_id in block_ids:
            if block_id not in begins:
                problems.append("missing managed block begin %s in %s" % (block_id, name))
            if block_id not in ends:
                problems.append("missing managed block end %s in %s" % (block_id, name))
        for block_id in sorted(set(begins) - set(ends)):
            problems.append("unclosed managed block %s in %s" % (block_id, name))
        for block_id in sorted(set(ends) - set(begins)):
            problems.append("orphan managed block end %s in %s" % (block_id, name))

    settings_errors, settings_warnings = check_settings(root)
    problems.extend(settings_errors)
    for warning in settings_warnings:
        sys.stderr.write("warning: %s\n" % warning)

    if problems:
        for problem in problems:
            sys.stderr.write("error: %s\n" % problem)
        return 1

    print("scaffold OK: %d files verified in %s" % (len(REQUIRED_FILES), root))
    return 0


if __name__ == "__main__":
    sys.exit(main())
