---
name: spec-close
description: 'Close a reviewed tech plan: re-verify the PASS gate, bump the version according to the plan, update changelog and backlog, mark the plan done, archive it, and produce a close report with the commit message. Use when the user asks to close, finish, archive, release, or finalize a plan, says "spec-close", "chiudi il piano", "archivia il piano", "chiudiamo questa feature". It never implements, reviews, or plans: it only closes work that already carries a PASS verdict.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Close — Close a Reviewed Plan

Closing is bookkeeping plus one last proof. You convert a reviewed plan into a permanent
record: version bumped, history updated, plan archived, and a report the user can act on.

## Position in the workflow

```
spec-review ──reviewed + PASS──► spec-close ──done──► archive/
```

## 0. Pre-flight — the gate

```
aispec plan validate-for close <REF>
```

This requires status `reviewed`, a valid plan structure, and a **latest** `**Verdict**: PASS`
in `## Review Notes`. On failure: stop and report. Never force, never hand-edit the verdict,
never close a plan whose review is `NEEDS WORK`.

`<skill-root>` is the `spec-workflow` skill directory
(`~/.copilot/skills/spec-workflow` for a user-scope install).

## 1. Re-verify the gate yourself

The verdict may be stale — code may have changed after the review.

1. Check the working tree is not dirtier than the reviewed state: `git status --porcelain`,
   `git diff --stat` since the review date. Commitments made after the review invalidate it;
   if the code changed materially, stop and ask for a new `spec-review`.
2. Run the full quality suite once more. A PASS followed by a red suite is not closeable.
3. `spec-plan.mjs checklist <REF>` must report every item ticked (exit 0).
4. Skim the plan's goals one last time: nothing obviously unmet in the diff.

## 2. Version bump

Read `version_bump` from the plan and `version.bump` from the profile
([../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md)).

| Plan value | Action |
|---|---|
| `patch` / `minor` / `major` | bump the manifest version by exactly that increment |
| `none` | skip, and say why in the report |
| missing, with a versioned project | ask the user which increment |

Verify the version is stored in one place; if the build embeds it (packaging metadata,
`__version__`, build config, desktop app manifests), update every copy the project keeps in
sync. Formats and sed-safe recipes: [references/close-procedures.md](./references/close-procedures.md).

Do not bump when the repository is unversioned — report `n/a`.

## 3. Update the living records

- **Changelog** (`CHANGELOG.md` or profile path) — add the entry under the new version, in the
  project's existing style. Link the plan and, for `security` plans, the advisory id. Skip
  when the project keeps no changelog.
- **Backlog / roadmap** — mark the linked item delivered, or link the archived plan to it.
- **Decision records / architecture** — only if the plan said a record was created; confirm it
  exists rather than duplicating it.
- Do not rewrite history, do not squash notes, do not delete the plan's sections.

## 4. Mark done and archive

```
aispec plan set-status <REF> done
aispec plan archive <REF>
```

Archive is only legal from `done`; if the script refuses, fix the status first, never the
script. Report the final path (usually `<plan_dir>/archive/NNN-slug.md`).

## 5. Close report

Deliver, in chat:

```markdown
## Closed — <plan title> (#NNN)

- **Status**: done, archived at `<path>`
- **Version**: <old> → <new> (or `n/a`)
- **Quality gate**: <commands> — ✓
- **Changelog**: <entry reference or n/a>
- **Security**: <advisory id and outcome, if a security plan>
- **Files**: <n> changed (<n> added, <n> modified, <n> deleted)

### Commit message
`<type>(<scope>): <description>`

### Remaining manual steps
- [ ] Review and commit the changes
- [ ] Push and open the merge request / pull request
- [ ] Tag `<version>` if the project releases from tags
```

The final section matters: the skills never commit, push, or tag. The user does.

## 6. Security plans

Beyond the generic steps:

1. Confirm the scanner is clean and that the evidence is recorded in the plan.
2. Confirm the changelog entry cites the advisory id.
3. If the outcome was an accepted risk, confirm owner and review date are in the plan, and
   restate them in the close report.
4. Never close with "upgrade pending" wording: either remediated, or accepted with an owner.

## Guardrails

- Use `spec-plan.mjs` for every supported plan operation, including gate validation,
  checklist/progress checks, and status/archive changes. Do not invent ad-hoc shell
  commands or manually reproduce a helper check; if the helper is unavailable or lacks the
  required operation, stop and report the blocker.
- Never close without a PASS, never close with unticked checklist items, never close with a
  red quality suite.
- Never alter the plan's goals, steps, notes, or verdicts while closing; the file is a record.
- Never run `git commit`, `git push`, `git tag`, or any history-changing command unless the
  profile sets `git.allow_writes: true`.
- Never delete the archived plan, and never renumber it.
- If the user asks to reopen after closing, that is a new plan that references the archived
  one in `depends_on` — not an edit to history.

## Outputs

- Version bumped (when applicable), changelog and backlog updated.
- Plan marked `done` and moved to the archive directory.
- A close report with the suggested commit message and the manual steps left to the user.
