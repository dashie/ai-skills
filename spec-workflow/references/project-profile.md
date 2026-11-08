# Project Profile

The workflow needs six facts about a repository: **where plans live**, **which statuses
exist**, **how to run quality checks**, **where documentation contracts live**, **where the
version is stored**, and **whether skills may write to Git**. All six are discovered, and
the result can be pinned in `.spec-workflow.yml` so later sessions do not re-ask.

## Discovery order

1. **Profile file** — `.spec-workflow.yml` or `.spec-workflow.yaml` at the repository root
   (the directory holding `.git`). First match wins.
2. **Existing layout** — inspect before inventing:

   | Signal | Inferred setting |
   |---|---|
   | `tech-plans/` exists | `plan_dir: tech-plans` |
   | `docs/specs/` or `docs/tech-plans/` exists | `plan_dir` = that directory |
   | `specs/` or `docs/plans/` exists | `plan_dir` = that directory |
   | `plan_dir/draft/` exists | `draft_dir` = that subfolder |
   | `plan_dir/archive/` or `plan_dir/done/` exists | `archive_dir` = that subfolder |
   | plan files start at `001-` | `number_width: 3` |
   | plan files start at `0001-` | `number_width: 4` |
   | plan files look like `SPEC-001-…` | `filename_prefix: SPEC-` |

3. **Ask the user** — only for facts that neither the profile nor the layout answers.
   Offer the discovered defaults as the recommended answer, then write the profile if the
   user agrees.

Never move, renumber, or rewrite existing plans to fit the defaults.

## Schema

```yaml
# Paths are relative to the repository root.
plan_dir: tech-plans
draft_dir: tech-plans/draft        # "" disables the draft subfolder
archive_dir: tech-plans/archive
number_width: 3
filename_prefix: ""                # e.g. "SPEC-" for SPEC-001-slug.md
statuses: [draft, in-progress, reviewed, done]
required_fields: [title, date, status, type, impact, area]
required_sections: [Summary, Why, Goals, Affected modules, Proposed solution, Implementation checklist]

# Read by the phase skills, not by spec_plan.py.
quality:
  all: "npm run check"
  tests: "npm test"
  lint: "npm run lint"
  types: "npm run typecheck"
  docs: "npm run docs:check"

docs:
  architecture: docs/ARCHITECTURE.md
  decisions: docs/ADR.md
  glossary: docs/GLOSSARY.md
  product: docs/PRODUCT.md
  developer_guide: docs/DEVELOPER-GUIDE.md
  changelog: CHANGELOG.md
  backlog: BACKLOG.md

version:
  file: package.json               # manifest that owns the version
  field: version                   # JSON/YAML key, TOML key, or "" for a VERSION file
  bump: plan                       # plan = use version_bump; else patch|minor|major|none

git:
  allow_writes: false              # true only if the user explicitly wants skills to commit
  commit_convention: conventional  # conventional | free
```

`spec_plan.py` reads only the top-level keys (`plan_dir`, `draft_dir`, `archive_dir`,
`number_width`, `filename_prefix`, `statuses`, `required_fields`, `required_sections`).
Every other block is guidance for the phase skills and must be honoured manually. Keep the
file flat — the helper uses a deliberately small YAML subset (scalars, inline lists,
`- item` lists, `#` comments).

### Status values

Keep the four canonical values unless the repository already uses different names for the
same gates. If it does, remap them in `statuses:` and state the mapping in the profile
comment; the phase skills refer to gates, not to literal strings, so a remap is safe as
long as the order (draft → active → reviewed → done) is preserved.

## Quality command discovery

Resolve in this order and record the result in the profile:

1. `quality.all` / `quality.tests` / `quality.lint` / `quality.types` from the profile.
2. Existing task runner: `make check|test|lint`, `just check|test|lint`, `task check`,
   `npm|pnpm|yarn run check`, `composer check`, `invoke check`.
3. Manifest scripts: `package.json` (`test`, `lint`, `typecheck`, `check`, `format:check`),
   `pyproject.toml` (`[tool.pytest]`, `[tool.ruff]`, `[tool.mypy]`, `[tool.pyright]`),
   `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle*`, `mix.exs`.
4. Ask the user for the exact commands, then persist them.

Never silently substitute a command the project does not define, and never report a phase
as green without pasting the actual command and its exit status.

### Stack presets

| Stack | Typical `quality` block |
|---|---|
| Node / TypeScript | `all: npm run check`, `tests: npm test`, `lint: npm run lint`, `types: npx tsc --noEmit` |
| Python (uv) | `all: uv run make check`, `tests: uv run pytest`, `lint: uv run ruff check .`, `types: uv run mypy .` |
| Python (plain) | `tests: python -m pytest`, `lint: ruff check .`, `types: mypy .` |
| Go | `tests: go test ./...`, `lint: go vet ./...`, `types: go build ./...` |
| Rust | `tests: cargo test`, `lint: cargo clippy -- -D warnings`, `types: cargo check` |
| Java / Maven | `all: ./mvnw -q verify` |
| Polyglot / unknown | run each package's own checks; ask when a package has none |

## Documentation contracts

`docs:` lists the living documents a change may have to update. A phase skill audits only
the paths that exist; a missing path is not an error. Typical obligations:

- `architecture` — new/changed modules, layers, data flow, external integrations.
- `decisions` — a new trade-off, technology choice, or reversal of an earlier decision.
- `glossary` — new or renamed domain terms.
- `product` — user-visible behaviour, scope, or business rules.
- `developer_guide` — build, run, test, or contribution steps.
- `changelog` — every user-visible change at close time.
- `backlog` — link the plan next to its backlog item at plan time; mark it delivered at
  close time.

## Version handling

`version.bump: plan` means the plan's own `version_bump` frontmatter decides
(`patch`/`minor`/`major`, or `none` to skip). If the manifest cannot be determined, or the
plan says nothing while the repository is versioned, ask the user. Repositories with no
version file skip the bump and say so in the close report.

## Profile snippet to propose

When a repository has no profile and the layout is already conventional, propose exactly
this and adjust only the lines that differ:

```yaml
# spec-driven workflow profile — see the spec-workflow skill
plan_dir: tech-plans
draft_dir: tech-plans/draft
archive_dir: tech-plans/archive
number_width: 3

quality:
  all: "<the command a CI job runs>"

docs:
  architecture: docs/ARCHITECTURE.md
  changelog: CHANGELOG.md

version:
  file: <manifest>
  field: version
  bump: plan

git:
  allow_writes: false
  commit_convention: conventional
```

Delete keys the repository does not use; an absent key means "no such obligation", not
"unknown".
