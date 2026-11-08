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
            for target in relative_links(text):
                resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
                if not os.path.exists(resolved):
                    problems.append("broken link %s in %s" % (target, name))
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
