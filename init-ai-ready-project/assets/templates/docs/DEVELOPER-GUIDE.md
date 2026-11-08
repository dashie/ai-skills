# Developer Guide — {{PROJECT_NAME}}

## Tech stack

{{TECH_STACK}}

## Prerequisites

{{PREREQUISITES}}

## Setup

{{SETUP_STEPS}}

Verify the setup before starting work: the build command below must succeed on a
clean checkout.

## Repository layout

{{REPO_LAYOUT}}

## Build

```bash
{{BUILD_COMMANDS}}
```

## Run

```bash
{{RUN_COMMANDS}}
```

## Test

```bash
{{TEST_COMMANDS}}
```

<!-- skill:block:devguide-test-rules section="## Test" -->
Fixed rules that apply to every change:

- Every change ships with the tests of the part it changes, in the same commit. A
  change without tests is not done.
- New behaviour needs a test that fails without the change and passes with it; a
  defect fix needs a regression test that reproduces the defect.
- Test each module independently: substitute the other modules at their contract
  boundary instead of starting them. A test that needs the whole system to run is a
  signal that the module is not decoupled enough.
- Never delete or weaken a test to make the build green; fix the cause.
<!-- skill:end:devguide-test-rules -->

## Lint and format

```bash
{{LINT_COMMANDS}}
```

## Extending the project

{{EXTENSION_GUIDE}}

<!-- skill:block:devguide-design-rules section="## Extending the project" -->
### Design rules

Fixed rules for adding anything to this project:

- Place the new code in the module that owns the responsibility. If no module owns
  it, add a module with one responsibility — do not grow an existing module for an
  unrelated concern.
- Depend on the other modules' public contracts only; never reach into their
  internals, and never introduce a dependency cycle.
- Start with the simplest implementation that satisfies the requirement (KISS). No
  speculative abstraction, extension point, or configuration for a need that is not
  there yet.
- Add the tests of the new code in the same change, at the module boundary, with the
  other modules replaced by fakes.
<!-- skill:end:devguide-design-rules -->

<!-- skill:block:devguide-git-standards -->
## Git Standards

These rules are mandatory for every contributor, human or AI. They are the
authoritative definition of how work enters this repository.

Automated agents never commit or push: they prepare the change and the commit
message, and only the user approves and saves it in Git (see
[AGENTS.md](../AGENTS.md#git-user-approved-changes-only)).

### Concise commits

- One commit per logical change. If the subject needs the word "and", split it.
- Subject line: imperative mood, lowercase after the type, no trailing period,
  maximum 72 characters. Write `add retry to metrics upload`, not `Added retries`
  and not `fixing stuff`.
- The subject states the effect, not the activity: `reject empty metric batches`,
  not `work on validation`.
- Body only when the reason is not obvious from the diff. Explain *why*, not *what*;
  the diff already shows the what. Wrap the body at 72 characters.
- Never commit commented-out code, debug output, secrets, credentials, or generated
  artefacts that the build can recreate.
- No `wip`, `temp`, `stuff`, or `fixes` commits on a shared branch. Clean up the
  history before requesting review.

### Conventional Commits

Every commit message follows the Conventional Commits format:

```
<type>[optional scope][!]: <subject>

[optional body]

[optional footer(s)]
```

Allowed types:

| Type | Use for |
|---|---|
| `feat` | A new user-visible capability |
| `fix` | A defect correction |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, missing semicolons — no behaviour change |
| `refactor` | Restructuring with no behaviour change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system, dependencies, packaging |
| `ci` | Continuous integration configuration |
| `chore` | Maintenance that fits nowhere else |
| `revert` | Reverting a previous commit |

Scopes are optional, lowercase, and name the part of the system that changed — use a
directory or component name from the repository layout (for example `api`, `cli`,
`docs`). Omit the scope when the change is repository-wide.

Breaking changes: append `!` after the type or scope and add a `BREAKING CHANGE:`
footer that states what breaks and how to migrate.

Footers: reference issues with `Refs: #123` or `Closes: #123`; list co-authors with
`Co-authored-by: Name <email>`.

Examples:

```
feat(upload): batch metrics requests by minute
fix(parser): reject timestamps without timezone
docs(adr): record storage engine choice
refactor!: move metric types into a shared module

BREAKING CHANGE: metric payloads now use `observed_at` instead of `timestamp`.
```

### Branches and integration

- `main` is always releasable; never commit directly to it.
- Branch from `main` with `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, or
  `chore/<slug>`; keep branches short-lived and rebase on `main` before review.
- One pull request per concern. Squash on merge so `main` keeps one commit per
  change, with the pull request title in Conventional Commits form.
- Long-running work uses feature flags or stacked pull requests, not long-lived
  branches.

### Language

Every artefact is written in English: commit messages, branch names, code,
identifiers, comments, tests, documentation, issue text, and user-facing strings.
<!-- skill:end:devguide-git-standards -->
