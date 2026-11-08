# Git Standards (reference)

The authoritative, verbatim text lives in the *Git Standards* section of
`assets/templates/docs/DEVELOPER-GUIDE.md`. This file is a summary for the person or
agent running the skill; do not copy it into a generated repository as a substitute
for the template section.

## Concise commits

- One logical change per commit; split on "and".
- Imperative subject, lowercase after the type, no period, at most 72 characters.
- Subject states the effect, not the activity.
- Body only when the reason is non-obvious; explain why, wrap at 72.
- No commented-out code, debug output, secrets, or generated artefacts.
- No `wip` / `temp` / `fixes` commits on a shared branch.

## Conventional Commits

`<type>[optional scope][!]: <subject>`

| Type | Use for |
|---|---|
| `feat` | New user-visible capability |
| `fix` | Defect correction |
| `docs` | Documentation only |
| `style` | Formatting without behaviour change |
| `refactor` | Restructuring without behaviour change |
| `perf` | Performance improvement |
| `test` | Tests only |
| `build` | Build system, dependencies, packaging |
| `ci` | CI configuration |
| `chore` | Maintenance that fits nowhere else |
| `revert` | Reverting a previous commit |

- Scope: optional, lowercase, names a component or directory.
- Breaking change: `!` after type/scope plus a `BREAKING CHANGE:` footer.
- Footers: `Refs: #123`, `Closes: #123`, `Co-authored-by: Name <email>`.

## Branches and integration

- `main` is always releasable; no direct commits.
- `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` from `main`.
- Short-lived branches, rebase before review, squash on merge.

## Agent permissions

Git history is user-owned. An agent may read the repository history (`git status`,
`git diff`, `git log`, `git show`, `git branch --list`) and must never write to it on
its own: no `git commit`, `git push`, `git tag`, `git merge`, `git rebase`,
`git reset --hard`, `git clean`, no staging toward an unreviewed commit, and no
pull-request creation or merge. The agent prepares the change and the proposed
message; the user approves and saves it.

This rule is stated in the *Git* section of `AGENTS.md` and referenced from the
*Git Standards* section of `docs/DEVELOPER-GUIDE.md`.

## Where these rules appear in a generated repository

- `docs/DEVELOPER-GUIDE.md` — full, authoritative section (template-owned).
- `CONTRIBUTING.md` — branch naming, review rules, and a pointer to the section above.
- `AGENTS.md` — condensed summary plus a pointer to the section above.
- `CLAUDE.md` — imports `AGENTS.md`; contains no rules of its own.

Keep the three consistent. Change them only by editing the templates, never by
patching a generated file.
