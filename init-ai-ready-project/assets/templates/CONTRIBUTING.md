# Contributing to {{PROJECT_NAME}}

{{INTRO}}

<!-- skill:block:contributing-before-you-start -->
## Before you start

- Read [docs/PRODUCT.md](./docs/PRODUCT.md) for the intended behaviour and
  [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the constraints you must preserve.
- Read [docs/DEVELOPER-GUIDE.md](./docs/DEVELOPER-GUIDE.md) to set up your environment.
- Open an issue before starting any change that alters behaviour, scope, or public
  interfaces. Trivial fixes (typos, broken links, formatting) can go straight to a
  pull request.
- All text — code, comments, identifiers, documentation, commit messages, issues —
  is written in English only.
<!-- skill:end:contributing-before-you-start -->

## Development workflow

{{DEVELOPMENT_WORKFLOW}}

## Branching

{{BRANCH_STRATEGY}}

<!-- skill:block:contributing-commit-messages -->
## Commit messages

Commits follow Conventional Commits and must stay concise: one logical change per
commit, a short imperative subject, no trailing period. The authoritative rules and
examples are in
[docs/DEVELOPER-GUIDE.md](./docs/DEVELOPER-GUIDE.md#git-standards).
<!-- skill:end:contributing-commit-messages -->

## Review

{{REVIEW_RULES}}

## Definition of done

{{DEFINITION_OF_DONE}}

<!-- skill:block:contributing-pull-requests -->
## Pull requests

- One concern per pull request; split unrelated changes.
- Description states the problem, the approach, and how it was verified.
- Link the issue the pull request resolves.
- Include screenshots or recordings for visible changes.
- Every pull request includes the tests of the code it touches; without them it is
  not ready for review.
- Keep the modules decoupled: no change reaches into another module's internals, and a
  change to a published contract comes with an ADR.
- Prefer the simplest design that works (KISS); speculative abstraction is rejected in
  review.
- Ensure CI is green and review conversations are resolved before merging.
<!-- skill:end:contributing-pull-requests -->
