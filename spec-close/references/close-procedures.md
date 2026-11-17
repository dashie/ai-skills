# Deterministic Close

`aispec plan close <REF> [--date YYYY-MM-DD]` is the only supported close operation. It
verifies the recorded PASS and complete implementation checklist, applies the configured
version bump, updates configured changelog/backlog records, sets the plan status to `done`,
and archives it. It does not rerun project tests or edit architecture or decision documents.

## Version configuration

Set the canonical version location in `.spec-workflow.yml`:

```yaml
version:
  file: package.json
  field: version
  bump: plan
```

With `bump: plan`, `version_bump` in the plan controls the increment. A profile value of
`patch`, `minor`, `major`, or `none` overrides the plan. A bump requires exactly one
configured version value and a plain `MAJOR.MINOR.PATCH` version.

Supported forms:

| File | `version.field` example |
|---|---|
| JSON | `version` or a dotted path such as `metadata.version` |
| TOML / INI / CFG | `project.version` (section and key) or `version` (root key) |
| YAML | `version` (root key) |
| Plain `.txt` / `.version` / `VERSION` | Empty |

Section/key text files must use `key = value` or `key: value`; the selected field must
match exactly once in its section. XML and unsupported formats, pre-release versions,
missing fields, ambiguous matches, and archive-name conflicts fail with an error.

## Changelog and backlog

When `docs.changelog` names an existing file, the helper adds a release section with the
close date (UTC today by default; override with `--date`) and a plan-linked entry. Categories
are selected from the plan type: feature → `Added`, fix → `Fixed`, security → `Security`,
and other types → `Changed`. A `version_bump: none` entry goes under `[Unreleased]`.

When `docs.backlog` names an existing file, exactly one line must contain the plan filename
stem (for example, `001-example`). The helper checks an unchecked Markdown box and adds a
delivered marker with the version and archived plan link. Missing or ambiguous matches fail
before any files are written; absent or unconfigured documentation paths are skipped.

The helper changes only the configured version field, configured changelog/backlog entries,
the plan's status, and the plan's location. It does not write Git history.
