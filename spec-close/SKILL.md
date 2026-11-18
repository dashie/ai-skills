---
name: spec-close
description: 'Close a reviewed tech plan: run the deterministic close command to verify the PASS gate and checklist, apply the configured version bump, mark the plan done, and archive it. Use when the user asks to close, finish, archive, release, or finalize a plan, says "spec-close", "chiudi il piano", "archivia il piano", "chiudiamo questa feature". It never implements, reviews, or plans.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Close — Close a Reviewed Plan

Closing is bookkeeping, not a second review. The review already owns the code and quality
checks; this phase verifies the recorded PASS and checklist, applies the configured version
bump, and archives the plan.

## Position in the workflow

```
spec-review ──reviewed + PASS──► spec-close ──done──► archive/
```

## Close

Run the deterministic helper command from the repository root:

```
aispec plan close <REF> [--date YYYY-MM-DD]
```

`close` checks the plan is `reviewed`, validates its latest review verdict is PASS, and
requires every implementation checklist item to be ticked. It applies the `version.bump`
policy from `.spec-workflow.yml` (`plan` uses the plan's `version_bump`), then sets status to
`done` and moves the file to the configured archive directory. If `docs.changelog` and
`docs.backlog` are configured and exist, it adds a changelog entry and marks the unique
backlog line containing the plan filename as delivered. If the backlog reference is absent
or ambiguous, it stops before writing. It does not rerun tests or repeat the code review.
Use `--date` to set the release date; otherwise the helper uses the current UTC date.

The version file and field must be configured in `.spec-workflow.yml`. The helper supports
JSON fields (including dotted paths), section/key text formats such as TOML, YAML root keys,
and plain `.txt`/`.version` files. Versions must be `MAJOR.MINOR.PATCH`; unsupported formats or
pre-release versions fail safely. See [close-procedures.md](./references/close-procedures.md)
for exact field formats and record-update behavior.

Do not edit the plan's goals, steps, notes, or verdict while closing. Decision records and
architecture documents are not modified by `close`; they remain ordinary documentation work
and should already be addressed by review where applicable.

## Close report

Deliver, in chat:

```markdown
## Closed — <plan title> (#NNN)

- **Status**: done, archived at `<path>`
- **Version**: <old> → <new>, or unchanged
- **Changelog / backlog**: updated or n/a
- **Executed by**: <agent name> (`<model>`), <tokens> tokens, <cost>

### Commit message
`<type>(<scope>): <description>`

### Remaining manual steps
- [ ] Review and commit the changes
- [ ] Push and open the merge request / pull request
- [ ] Tag `<version>` if the project releases from tags
```

Always include the **Executed by** line, even when the values are unavailable. Take the agent
name, model, token count, and cost from the session's own usage/accounting data when it is
accessible (for example the session usage summary or its cost report). For every value the
session does not expose, write `unknown` instead of omitting the field or estimating it:

```markdown
- **Executed by**: unknown (`unknown`), unknown tokens, unknown cost
```

Never infer, approximate, or fabricate usage numbers, and never copy them from another
session. The line describes the run that executed the plan, not this close run.

The helper never commits, pushes, or tags. The user does.

## Guardrails

- Use only `spec-plan.mjs close` for the close operation. If the helper is unavailable,
  stop and report the blocker.
- Never close without a PASS or with unticked checklist items.
- Never alter the plan's goals, steps, notes, or verdicts while closing; the file is a record.
- Never run `git commit`, `git push`, `git tag`, or any history-changing command unless the
  profile sets `git.allow_writes: true`.
- Never delete the archived plan, and never renumber it.
- If the user asks to reopen after closing, propose `spec-plan` for a new plan that
  references the archived one in `depends_on`; create it only when the user explicitly asks
  for `spec-plan`, and never edit history.

## Outputs

- Version bumped (when applicable); plan marked `done` and moved to the archive directory.
- A close report with the execution metadata (agent, model, tokens, cost), the suggested
  commit message, and the manual steps left to the user.
