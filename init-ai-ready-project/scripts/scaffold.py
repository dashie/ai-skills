#!/usr/bin/env python3
"""Render the AI-ready project scaffold from the skill templates.

Deterministic by design: the same values file always produces the same bytes.
Templates live in assets/templates and are never generated at runtime.
"""

import argparse
import json
import os
import re
import sys

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_ROOT = os.path.join(SKILL_ROOT, "assets", "templates")
GITIGNORE_ROOT = os.path.join(TEMPLATE_ROOT, "gitignore")

PLACEHOLDER = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

# template path (relative to assets/templates) -> destination path
TARGETS = [
    ("README.md", "README.md"),
    ("CONTRIBUTING.md", "CONTRIBUTING.md"),
    ("AGENTS.md", "AGENTS.md"),
    ("CLAUDE.md", "CLAUDE.md"),
    ("docs/PRODUCT.md", "docs/PRODUCT.md"),
    ("docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"),
    ("docs/ADR.md", "docs/ADR.md"),
    ("docs/GLOSSARY.md", "docs/GLOSSARY.md"),
    ("docs/DEVELOPER-GUIDE.md", "docs/DEVELOPER-GUIDE.md"),
]

GITIGNORE_VARIANTS = ["generic", "node", "python", "go", "rust", "java"]


def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def collect_placeholders(text):
    return set(PLACEHOLDER.findall(text))


def load_template(relative_path):
    path = os.path.join(TEMPLATE_ROOT, relative_path)
    if not os.path.isfile(path):
        fail("missing template: %s" % path)
    return read(path)


def fail(message, code=1):
    sys.stderr.write("error: %s\n" % message)
    raise SystemExit(code)


def build_variable_map():
    """Return placeholder name -> list of templates that use it."""
    usage = {}
    for relative_path, _ in TARGETS:
        for name in collect_placeholders(load_template(relative_path)):
            usage.setdefault(name, []).append(relative_path)
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


def render(template_rel, values, usage):
    template = load_template(template_rel)
    required = collect_placeholders(template)
    missing = sorted(name for name in required if name not in values)
    if missing:
        sources = sorted({src for name in missing for src in usage.get(name, [])})
        fail(
            "missing values for %s: %s (used in %s)"
            % (template_rel, ", ".join(missing), ", ".join(sources))
        )
    rendered = template
    for name in sorted(required):
        rendered = rendered.replace("{{%s}}" % name, values[name])
    leftover = collect_placeholders(rendered)
    if leftover:
        fail(
            "unresolved placeholders in %s: %s"
            % (template_rel, ", ".join(sorted(leftover)))
        )
    if not rendered.endswith("\n"):
        rendered += "\n"
    return rendered


def render_gitignore(variant):
    if variant not in GITIGNORE_VARIANTS:
        fail(
            "unknown gitignore variant %r (choose from %s)"
            % (variant, ", ".join(GITIGNORE_VARIANTS))
        )
    common = read(os.path.join(GITIGNORE_ROOT, "_common.gitignore"))
    if variant == "generic":
        return common if common.endswith("\n") else common + "\n"
    specific = read(os.path.join(GITIGNORE_ROOT, "%s.gitignore" % variant))
    if not specific.endswith("\n"):
        specific += "\n"
    return specific + "\n" + common


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Render the AI-ready project documentation scaffold."
    )
    parser.add_argument("--dest", help="destination directory (created if missing)")
    parser.add_argument("--values", help="JSON file with one value per placeholder")
    parser.add_argument(
        "--gitignore",
        default="generic",
        help="gitignore variant: %s (default: generic)" % ", ".join(GITIGNORE_VARIANTS),
    )
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    parser.add_argument(
        "--dry-run", action="store_true", help="report the planned writes only"
    )
    parser.add_argument(
        "--list-variables",
        action="store_true",
        help="print every placeholder and the templates that use it",
    )
    args = parser.parse_args(argv)

    usage = build_variable_map()

    if args.list_variables:
        for name in sorted(usage):
            print("%-32s %s" % (name, ", ".join(usage[name])))
        return 0

    if not args.dest or not args.values:
        parser.error("--dest and --values are required")

    values = load_values(args.values)
    unknown = sorted(set(values) - set(usage))
    if unknown:
        sys.stderr.write(
            "warning: unused values (not referenced by any template): %s\n"
            % ", ".join(unknown)
        )

    rendered = []
    for template_rel, destination in TARGETS:
        rendered.append((destination, render(template_rel, values, usage)))
    rendered.append((".gitignore", render_gitignore(args.gitignore)))

    dest_root = os.path.abspath(args.dest)
    if os.path.exists(dest_root) and not os.path.isdir(dest_root):
        fail("destination is not a directory: %s" % dest_root)

    existing = [
        os.path.join(dest_root, destination)
        for destination, _ in rendered
        if os.path.exists(os.path.join(dest_root, destination))
    ]
    if existing and not args.force:
        fail(
            "refusing to overwrite existing files (use --force only with user approval):\n  "
            + "\n  ".join(existing)
        )

    for destination, content in rendered:
        target = os.path.join(dest_root, destination)
        if args.dry_run:
            print("would write %s (%d bytes)" % (target, len(content.encode("utf-8"))))
            continue
        parent = os.path.dirname(target)
        if parent and not os.path.isdir(parent):
            os.makedirs(parent)
        with open(target, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        print("wrote %s" % target)

    return 0


if __name__ == "__main__":
    sys.exit(main())
