# Close Procedures

Mechanics for the close phase: locating the version, bumping it in each common format,
keeping the changelog consistent, and updating the backlog. Always inspect before editing;
the recipes assume the file structure is already known.

## Locating the version

Search in this order and stop at the first authoritative source:

| File | Field / location |
|---|---|
| `package.json` (root or package workspace) | `"version"` |
| `pyproject.toml` | `[project] version` or `[tool.poetry] version` |
| `setup.cfg` / `setup.py` | `version =` |
| `__init__.py` / `_version.py` | `__version__ =` |
| `Cargo.toml` | `[package] version` |
| `pom.xml` | `<version>` under `<project>` (not `<dependency>`) |
| `build.gradle(.kts)` | `version =` |
| `VERSION` / `version.txt` | whole file |
| `*.csproj` | `<Version>` |
| `composer.json` | `"version"` |
| `Chart.yaml` | `version` and `appVersion` |

Multiple authoritative sources means the project keeps them in sync (desktop shells, bundled
backends, packaging metadata). Bump **all** of them, or ask which one is canonical.

## Bump rules

`MAJOR.MINOR.PATCH`, plain integers, no leading zeros:

| Increment | From | To |
|---|---|---|
| `patch` | `1.4.2` | `1.4.3` |
| `minor` | `1.4.2` | `1.5.0` |
| `major` | `1.4.2` | `2.0.0` |

- Pre-release suffixes (`1.5.0-rc.1`) are only touched if the project's release flow says so;
  otherwise ask.
- Pre-1.0 projects often still treat `minor` as breaking — follow the project's stated
  policy over generic semantics, and say which policy you applied.
- A `security` plan usually takes `patch`; a breaking remediation takes whatever the plan
  declared, never a silent escalation.

## Editing safely

- Edit the manifest textually only when the field is unambiguous; otherwise let the ecosystem
  tool do it (`npm version --no-git-tag-version`, `uv version`, `poetry version`,
  `cargo set-version`, `mvn versions:set`). Those commands must not create tags or commits.
- Never let the bump command run Git operations. Pass the no-git flag when one exists; if it
  does not, edit the file instead.
- Re-run the build or metadata check afterwards; a broken version string fails packaging, not
  tests.

## Changelog

Follow the file that exists. For Keep a Changelog, prepend a section:

```markdown
## [1.4.3] - 2026-03-14

### Fixed
- Reject empty tile payloads that produced zero-size geometry (`tech-plans/archive/012-empty-tile-payload.md`)

### Security
- Upgrade `lib-foo` to 3.2.1 for CVE-2026-12345
```

Rules:

- Use the sections already present in the file; do not invent a new taxonomy.
- One bullet per user-visible change, imperative, outcome first.
- Reference the archived plan path (relative to the changelog) and the advisory id for
  security items.
- Bump the link block at the bottom if the project keeps one.
- No user-visible change? Say so in the close report instead of adding an empty section.

## Backlog / roadmap

When the project keeps `BACKLOG.md`, `ROADMAP.md`, or an issue tracker mirror:

- Find the item that motivated the plan (the plan should already link to it).
- Mark it delivered with a link to the archived plan and the version that carries it.
- Do not renumber items; do not delete entries; strike-through plus delivered marker is enough.
- No tracker integration available? Put the manual step in the close report.

## Post-close checklist for the report

- [ ] Version bumped in every authoritative file
- [ ] Changelog entry added (or explicitly not applicable)
- [ ] Backlog/roadmap updated (or explicitly not applicable)
- [ ] Plan marked `done` and archived
- [ ] Commit message suggested
- [ ] Tag/release step listed for the user, never performed
