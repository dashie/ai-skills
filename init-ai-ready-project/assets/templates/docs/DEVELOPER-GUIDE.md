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

These rules are mandatory for every contributor, human or AI. They define how work
enters this repository.

Automated agents never commit or push: they prepare the change and the commit
message, and only the user approves and saves it in Git (see
[AGENTS.md](../AGENTS.md#git-user-approved-changes-only)).

### Commit messages

Every commit message follows Conventional Commits and stays concise: one logical
change per commit, an imperative subject of at most 72 characters, no trailing
period, a body only when the reason is not obvious.

The complete contract — format, allowed types and scopes, subject and body rules,
footers, breaking changes, and accepted and rejected examples — lives in
[.github/copilot-commit-message-instructions.md](../.github/copilot-commit-message-instructions.md).
That file is the single source of truth for message format: it is what an assistant
reads when it drafts a commit message, and it is registered for that purpose in
[.vscode/settings.json](../.vscode/settings.json). Read it before writing a message;
do not restate it here.

### Branches and integration

- `main` is always releasable; never commit directly to it.
- Branch from `main` with `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, or
  `chore/<slug>`; keep branches short-lived and rebase on `main` before review.
- One pull request per concern. Squash on merge so `main` keeps one commit per
  change, with the pull request title in Conventional Commits form.
- Long-running work uses feature flags or stacked pull requests, not long-lived
  branches.

### Pull requests

The title follows the commit message format, because a squash merge turns it into the
commit subject. The description states the problem, the approach, the verification, and
the deliberate exclusions. The contract is in
[.github/copilot-pull-request-instructions.md](../.github/copilot-pull-request-instructions.md).

### Language

Every artefact is written in English: commit messages, branch names, code,
identifiers, comments, tests, documentation, issue text, and user-facing strings.
<!-- skill:end:devguide-git-standards -->
