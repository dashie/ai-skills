#!/usr/bin/env python3
"""Deterministic tech-plan operations for the spec-* workflow skills.

Zero dependencies, Python 3.9+ standard library only. Every subcommand resolves
the repository root from the current working directory (nearest ancestor holding
`.git`), reads an optional `.spec-workflow.yml` profile, and never modifies files
outside the configured plan directories.

Commands:
    next-number
    list [--status STATUS]
    show REF
    checklist REF
    validate REF [--strict]
    validate-for {implement|review|close} REF
    set-status REF STATUS
    archive REF
    config

REF is a plan number (007), a number plus slug (007-my-feature), or a path.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_NAMES = (".spec-workflow.yml", ".spec-workflow.yaml")
DEFAULT_STATUSES = ["draft", "in-progress", "reviewed", "done"]
DEFAULT_REQUIRED_FIELDS = ["title", "date", "status", "type", "impact", "area"]
DEFAULT_REQUIRED_SECTIONS = [
    "Summary",
    "Why",
    "Goals",
    "Affected modules",
    "Proposed solution",
    "Implementation checklist",
]
KNOWN_TYPES = {"feature", "fix", "refactor", "perf", "docs", "test", "security", "chore"}
KNOWN_IMPACT = {"low", "medium", "high"}
KNOWN_BUMPS = {"patch", "minor", "major", "none"}
CHECKLIST_MANDATORY = [
    "open questions resolved",
    "quality suite",
    "implementation notes",
]
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
STATUS_LINE_RE = re.compile(r"^(status:\s*).*$", re.M)
VERDICT_RE = re.compile(r"\*\*Verdict\*\*:\s*(PASS|NEEDS WORK)", re.I)


class PlanError(Exception):
    pass


# ── Minimal YAML ─────────────────────────────────────────────────────


def _strip_comment(line: str) -> str:
    out: list[str] = []
    quote: str | None = None
    for index, char in enumerate(line):
        if quote:
            out.append(char)
            if char == quote:
                quote = None
            continue
        if char in "\"'":
            quote = char
            out.append(char)
            continue
        if char == "#" and (index == 0 or line[index - 1] in " \t"):
            break
        out.append(char)
    return "".join(out).rstrip()


def _coerce(value: str):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        return [_coerce(part) for part in inner.split(",")] if inner else []
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return value


def parse_mini_yaml(text: str) -> dict:
    data: dict = {}
    current: str | None = None
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line.strip():
            continue
        stripped = line.lstrip()
        if stripped.startswith("- "):
            item = _coerce(stripped[2:])
            if current is None:
                continue
            if not isinstance(data.get(current), list):
                data[current] = []
            data[current].append(item)
            continue
        match = re.match(r"^([^:\s][^:]*?)\s*:\s*(.*)$", stripped)
        if not match:
            continue
        current = match.group(1).strip()
        value = match.group(2).strip()
        data[current] = "" if value == "" else _coerce(value)
    return data


# ── Config ───────────────────────────────────────────────────────────


def find_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


@dataclass
class Config:
    root: Path
    plan_dir: Path
    draft_dir: Path | None
    archive_dir: Path
    number_width: int = 3
    filename_prefix: str = ""
    statuses: list = field(default_factory=lambda: list(DEFAULT_STATUSES))
    required_fields: list = field(default_factory=lambda: list(DEFAULT_REQUIRED_FIELDS))
    required_sections: list = field(default_factory=lambda: list(DEFAULT_REQUIRED_SECTIONS))

    def plan_dirs(self) -> list[Path]:
        dirs = [self.plan_dir]
        if self.draft_dir:
            dirs.append(self.draft_dir)
        return dirs

    def as_dict(self) -> dict:
        return {
            "root": str(self.root),
            "plan_dir": str(self.plan_dir),
            "draft_dir": str(self.draft_dir) if self.draft_dir else None,
            "archive_dir": str(self.archive_dir),
            "number_width": self.number_width,
            "filename_prefix": self.filename_prefix,
            "statuses": self.statuses,
            "required_fields": self.required_fields,
            "required_sections": self.required_sections,
        }


def _as_path(root: Path, value) -> Path:
    path = Path(str(value))
    return path if path.is_absolute() else root / path


def load_config(root: Path | None = None) -> Config:
    root = root or find_root()
    raw: dict = {}
    for name in CONFIG_NAMES:
        candidate = root / name
        if candidate.is_file():
            raw = parse_mini_yaml(candidate.read_text(encoding="utf-8"))
            break

    plan_dir = _as_path(root, raw.get("plan_dir") or "tech-plans")
    draft_raw = raw.get("draft_dir", None)
    if draft_raw is None:
        draft_dir = plan_dir / "draft" if (plan_dir / "draft").is_dir() else None
    elif str(draft_raw).strip().lower() in ("", "false", "none", "null"):
        draft_dir = None
    else:
        draft_dir = _as_path(root, draft_raw)
    archive_dir = _as_path(root, raw.get("archive_dir") or str(plan_dir / "archive"))

    def _list(key: str, fallback: list) -> list:
        value = raw.get(key)
        if isinstance(value, list) and value:
            return [str(item) for item in value]
        if isinstance(value, str) and "," in value:
            return [part.strip() for part in value.split(",") if part.strip()]
        return list(fallback)

    try:
        width = int(raw.get("number_width") or 3)
    except (TypeError, ValueError):
        width = 3

    return Config(
        root=root,
        plan_dir=plan_dir,
        draft_dir=draft_dir,
        archive_dir=archive_dir,
        number_width=width,
        filename_prefix=str(raw.get("filename_prefix") or "").strip(),
        statuses=_list("statuses", DEFAULT_STATUSES),
        required_fields=_list("required_fields", DEFAULT_REQUIRED_FIELDS),
        required_sections=_list("required_sections", DEFAULT_REQUIRED_SECTIONS),
    )


# ── Plan files ───────────────────────────────────────────────────────


@dataclass
class Plan:
    path: Path
    meta: dict
    body: str
    text: str

    @property
    def status(self) -> str:
        return str(self.meta.get("status", "")).strip()

    @property
    def title(self) -> str:
        return str(self.meta.get("title", "")).strip()

    @property
    def number(self) -> int | None:
        match = re.search(r"(\d+)", self.path.name)
        return int(match.group(1)) if match else None


def load_plan(path: Path) -> Plan:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    meta = parse_mini_yaml(match.group(1)) if match else {}
    body = text[match.end() :] if match else text
    return Plan(path=path, meta=meta, body=body, text=text)


def iter_plans(cfg: Config, include_archive: bool = True) -> list[Plan]:
    seen: set[Path] = set()
    plans: list[Plan] = []
    dirs = cfg.plan_dirs() + ([cfg.archive_dir] if include_archive else [])
    for directory in dirs:
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.md")):
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            plans.append(load_plan(path))
    return plans


def resolve_ref(cfg: Config, ref: str) -> Path:
    ref = ref.strip()
    if ref.endswith(".md") or "/" in ref or "\\" in ref:
        for candidate in (Path(ref), Path.cwd() / ref, cfg.root / ref):
            if candidate.is_file():
                return candidate.resolve()
        raise PlanError(f"plan file not found: {ref}")

    match = re.match(r"^[A-Za-z_-]*?(\d+)(?:-(.+))?$", ref)
    if not match:
        raise PlanError(f"invalid plan reference '{ref}' (expected NNN, NNN-slug, or a path)")
    number = int(match.group(1))
    slug = match.group(2)
    label = f"{number:0{cfg.number_width}d}"

    search_dirs = [*cfg.plan_dirs(), cfg.archive_dir]
    matches: list[Path] = []
    for directory in search_dirs:
        if not directory.is_dir():
            continue
        for path in directory.glob("*.md"):
            if _plan_number(path) != number:
                continue
            if slug is not None and _plan_slug(path) != slug:
                continue
            matches.append(path.resolve())

    unique = sorted(set(matches))
    if len(unique) == 1:
        return unique[0]
    if not unique:
        raise PlanError(f"no plan numbered {label}" + (f" with slug '{slug}'" if slug else ""))
    listing = "\n".join(f"  - {path.name}" for path in unique)
    raise PlanError(f"ambiguous plan number {label}:\n{listing}")


def _plan_number(path: Path) -> int | None:
    match = re.search(r"(\d+)", path.name)
    return int(match.group(1)) if match else None


def _plan_slug(path: Path) -> str:
    stem = path.name[: -len(path.suffix)] if path.suffix else path.name
    match = re.search(r"\d+-(.+)$", stem)
    return match.group(1) if match else ""


def sections(body: str) -> dict[str, str]:
    found: dict[str, str] = {}
    current: str | None = None
    buffer: list[str] = []
    for line in body.splitlines():
        heading = re.match(r"^##(?!#)\s+(.*)$", line)
        if heading:
            if current is not None:
                found[current] = "\n".join(buffer)
            current = heading.group(1).strip()
            buffer = []
            continue
        if current is not None:
            buffer.append(line)
    if current is not None:
        found[current] = "\n".join(buffer)
    return found


def checklist_items(plan: Plan) -> list[tuple[int, bool, str]]:
    """Checkbox items of the `## Implementation checklist` section.

    Falls back to the whole document when the section is absent, so a malformed
    plan still reports something useful. Line numbers are absolute.
    """
    lines = plan.text.splitlines()
    start = None
    end = len(lines)
    for index, line in enumerate(lines):
        heading = re.match(r"^##(?!#)\s+(.*)$", line)
        if not heading:
            continue
        if start is None:
            if heading.group(1).strip().lower() == "implementation checklist":
                start = index + 1
        else:
            end = index
            break

    if start is None:
        start, end = 0, len(lines)

    items: list[tuple[int, bool, str]] = []
    for index in range(start, end):
        match = re.match(r"^\s*-\s*\[([ xX])\]\s*(.+?)\s*$", lines[index])
        if match:
            items.append((index + 1, match.group(1).lower() == "x", match.group(2)))
    return items


def _section_lookup(found: dict[str, str], name: str) -> str | None:
    lowered = name.strip().lower()
    for key, value in found.items():
        if key.strip().lower() == lowered:
            return value
    return None


# ── Validation ───────────────────────────────────────────────────────


def collect_validation(cfg: Config, plan: Plan, strict: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not plan.meta:
        errors.append("missing YAML frontmatter")
        return errors, warnings

    for name in cfg.required_fields:
        value = plan.meta.get(name)
        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(f"missing required frontmatter field: {name}")

    status = plan.status
    if status and status not in cfg.statuses:
        errors.append(f"invalid status '{status}' (allowed: {', '.join(cfg.statuses)})")

    date_value = str(plan.meta.get("date", "")).strip()
    if date_value and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_value):
        errors.append(f"invalid date '{date_value}' (expected YYYY-MM-DD)")

    plan_type = str(plan.meta.get("type", "")).strip().lower()
    if plan_type and plan_type not in KNOWN_TYPES:
        warnings.append(f"unknown type '{plan_type}' (known: {', '.join(sorted(KNOWN_TYPES))})")

    impact = str(plan.meta.get("impact", "")).strip().lower()
    if impact and impact not in KNOWN_IMPACT:
        errors.append(f"invalid impact '{impact}' (allowed: low, medium, high)")

    bump = str(plan.meta.get("version_bump", "")).strip().lower()
    if not bump:
        warnings.append("version_bump is not set (close will ask instead of bumping automatically)")
    elif bump not in KNOWN_BUMPS:
        warnings.append(f"unknown version_bump '{bump}' (known: {', '.join(sorted(KNOWN_BUMPS))})")

    depends_on = plan.meta.get("depends_on")
    if depends_on is not None and not isinstance(depends_on, list):
        errors.append("depends_on must be a YAML list")

    found = sections(plan.body)
    for name in cfg.required_sections:
        value = _section_lookup(found, name)
        if value is None:
            errors.append(f"missing required section: ## {name}")
        elif not value.strip() and name != "Implementation checklist":
            errors.append(f"empty required section: ## {name}")

    items = checklist_items(plan)
    if not items:
        warnings.append("implementation checklist has no '- [ ]' items")
    else:
        done = sum(1 for _, checked, _ in items if checked)
        if strict and done != len(items):
            errors.append(f"implementation checklist incomplete ({done}/{len(items)} ticked)")
        labels = " | ".join(text.lower() for _, _, text in items)
        for mandatory in CHECKLIST_MANDATORY:
            if mandatory.lower() not in labels:
                warnings.append(f"implementation checklist is missing the mandatory item '{mandatory}'")

    if plan_type == "security" and _section_lookup(found, "Security considerations") is None:
        warnings.append("security plan has no '## Security considerations' section")

    return errors, warnings


def run_validation(cfg: Config, plan: Plan, strict: bool) -> int:
    errors, warnings = collect_validation(cfg, plan, strict)
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        print(f"INVALID: {plan.path.name} ({len(errors)} error(s), {len(warnings)} warning(s))", file=sys.stderr)
        return 1
    print(f"OK: {plan.path.name} ({len(warnings)} warning(s))")
    return 0


def unmet_dependencies(cfg: Config, plan: Plan) -> list[str]:
    problems: list[str] = []
    depends_on = plan.meta.get("depends_on") or []
    if not isinstance(depends_on, list):
        return problems
    for entry in depends_on:
        try:
            path = resolve_ref(cfg, str(entry))
        except PlanError:
            problems.append(f"dependency {entry} not found")
            continue
        dependency = load_plan(path)
        if dependency.status != "done":
            problems.append(f"dependency {entry} is '{dependency.status}', expected 'done'")
    return problems


def validate_for(cfg: Config, plan: Plan, phase: str) -> int:
    allowed, label = {
        "implement": ({"draft", "in-progress"}, "draft (new) or in-progress (resume)"),
        "review": ({"in-progress"}, "in-progress"),
        "close": ({"reviewed"}, "reviewed"),
    }[phase]

    if plan.status not in allowed:
        print(
            f"ERROR: cannot {phase} {plan.path.name} — status is '{plan.status}', expected {label}",
            file=sys.stderr,
        )
        return 1

    if phase == "close":
        verdicts = VERDICT_RE.findall(plan.text)
        if not verdicts or verdicts[-1].upper() != "PASS":
            latest = verdicts[-1].upper() if verdicts else "none"
            print(
                f"ERROR: cannot close — latest review verdict is {latest}, expected PASS",
                file=sys.stderr,
            )
            return 1

    if phase == "implement":
        problems = unmet_dependencies(cfg, plan)
        if problems:
            for problem in problems:
                print(f"ERROR: {problem}", file=sys.stderr)
            return 1

    errors, warnings = collect_validation(cfg, plan, strict=False)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    for warning in warnings:
        print(f"WARN: {warning}")
    if errors:
        return 1

    print(f"OK: {plan.path.name} ready for {phase} (status: {plan.status})")
    return 0


# ── Commands ─────────────────────────────────────────────────────────


def cmd_next_number(cfg: Config, _args) -> int:
    highest = 0
    for plan in iter_plans(cfg):
        if plan.number is not None:
            highest = max(highest, plan.number)
    print(f"{cfg.filename_prefix}{highest + 1:0{cfg.number_width}d}")
    return 0


def cmd_list(cfg: Config, args) -> int:
    plans = [plan for plan in iter_plans(cfg) if plan.path.parent != cfg.archive_dir]
    if args.status != "all":
        plans = [plan for plan in plans if plan.status == args.status]
    if not plans:
        print("no plans")
        return 0
    for plan in sorted(plans, key=lambda item: (item.number or 0, item.path.name)):
        items = checklist_items(plan)
        done = sum(1 for _, checked, _ in items if checked)
        progress = f"{done}/{len(items)}" if items else "-"
        print(
            f"{plan.path.stem:<44} {plan.status:<12} {str(plan.meta.get('type', '-')):<9} "
            f"{str(plan.meta.get('impact', '-')):<7} {progress:<7} {plan.title}"
        )
    return 0


def cmd_show(cfg: Config, args) -> int:
    plan = load_plan(resolve_ref(cfg, args.ref))
    print(f"file: {plan.path}")
    for key in ("title", "status", "type", "impact", "area", "version_bump", "depends_on", "tags"):
        if key in plan.meta:
            print(f"{key}: {plan.meta[key]}")
    items = checklist_items(plan)
    if items:
        done = sum(1 for _, checked, _ in items if checked)
        print(f"checklist: {done}/{len(items)}")
    verdicts = VERDICT_RE.findall(plan.text)
    print(f"verdict: {verdicts[-1].upper() if verdicts else 'none'}")
    print(f"implementation_notes: {len(re.findall(r'^## Implementation Notes', plan.text, re.M))}")
    review_entries = re.findall(r"^## Review Notes", plan.text, re.M)
    print(f"review_rounds: {len(review_entries)}")
    return 0


def cmd_checklist(cfg: Config, args) -> int:
    plan = load_plan(resolve_ref(cfg, args.ref))
    items = checklist_items(plan)
    if not items:
        print("no checklist items")
        return 1
    for line_number, checked, text in items:
        if not checked:
            print(f"{plan.path.name}:{line_number}: {text}")
    done = sum(1 for _, checked, _ in items if checked)
    print(f"{done}/{len(items)} complete")
    return 0 if done == len(items) else 2


def cmd_validate(cfg: Config, args) -> int:
    return run_validation(cfg, load_plan(resolve_ref(cfg, args.ref)), args.strict)


def cmd_validate_for(cfg: Config, args) -> int:
    return validate_for(cfg, load_plan(resolve_ref(cfg, args.ref)), args.phase)


def _move(path: Path, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    destination = target_dir / path.name
    if destination.resolve() == path.resolve():
        return path
    if destination.exists():
        raise PlanError(f"cannot move {path.name}: {destination} already exists")
    shutil.move(str(path), str(destination))
    return destination


def cmd_set_status(cfg: Config, args) -> int:
    if args.status not in cfg.statuses:
        raise PlanError(f"invalid status '{args.status}' (allowed: {', '.join(cfg.statuses)})")
    path = resolve_ref(cfg, args.ref)
    plan = load_plan(path)
    if not FRONTMATTER_RE.match(plan.text):
        raise PlanError(f"{path.name} has no YAML frontmatter")
    if plan.status == args.status:
        print(f"{path.name} already '{args.status}'")
        return 0

    updated = STATUS_LINE_RE.sub(lambda match: f"{match.group(1)}{args.status}", plan.text, count=1)
    path.write_text(updated, encoding="utf-8")

    if args.status == "draft" and cfg.draft_dir:
        path = _move(path, cfg.draft_dir)
    elif args.status != "draft" and cfg.draft_dir and path.parent.resolve() == cfg.draft_dir.resolve():
        path = _move(path, cfg.plan_dir)

    print(f"{path.name} → status: {args.status}")
    return 0


def cmd_archive(cfg: Config, args) -> int:
    path = resolve_ref(cfg, args.ref)
    plan = load_plan(path)
    if plan.status != "done":
        raise PlanError(f"cannot archive {path.name} — status is '{plan.status}', expected 'done'")
    destination = _move(path, cfg.archive_dir)
    try:
        shown = destination.relative_to(cfg.root)
    except ValueError:
        shown = destination
    print(f"archived: {shown}")
    return 0


def cmd_config(cfg: Config, _args) -> int:
    for key, value in cfg.as_dict().items():
        print(f"{key}: {value}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="spec_plan.py", description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("next-number").set_defaults(func=cmd_next_number)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--status", default="all")
    list_parser.set_defaults(func=cmd_list)

    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("ref")
    show_parser.set_defaults(func=cmd_show)

    checklist_parser = subparsers.add_parser("checklist")
    checklist_parser.add_argument("ref")
    checklist_parser.set_defaults(func=cmd_checklist)

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("ref")
    validate_parser.add_argument("--strict", action="store_true", help="fail when the checklist is incomplete")
    validate_parser.set_defaults(func=cmd_validate)

    for_parser = subparsers.add_parser("validate-for")
    for_parser.add_argument("phase", choices=["implement", "review", "close"])
    for_parser.add_argument("ref")
    for_parser.set_defaults(func=cmd_validate_for)

    status_parser = subparsers.add_parser("set-status")
    status_parser.add_argument("ref")
    status_parser.add_argument("status")
    status_parser.set_defaults(func=cmd_set_status)

    archive_parser = subparsers.add_parser("archive")
    archive_parser.add_argument("ref")
    archive_parser.set_defaults(func=cmd_archive)

    subparsers.add_parser("config").set_defaults(func=cmd_config)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        cfg = load_config()
        return args.func(cfg, args)
    except PlanError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
