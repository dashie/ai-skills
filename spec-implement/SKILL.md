---
name: spec-implement
description: 'Execute an approved tech plan step by step, file by file, keeping the checklist and Implementation Notes as the live progress log, and running the project quality gate after every step. Use when the user asks to implement or execute a plan, resume an interrupted implementation, says "spec-implement", "implementa il piano", "esegui il piano", "procedi con il piano". It never plans new work, never reviews its own result, and never closes the plan.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Implement — Plan-Driven Implementation

You are executing a written plan. The plan decides *what*; you decide *how* within its
scope. You verify continuously instead of at the end, and you leave the plan usable as a
resume point at any moment.

## 0. Pre-flight — gate before touching anything

```
python3 <skill-root>/scripts/spec_plan.py validate-for implement <REF>
```

The gate accepts `draft` (new run) and `in-progress` (resume), rejects everything else, and
verifies that every `depends_on` plan is `done`. If it fails: stop, report the exact error,
name the command that is allowed instead. Never force it.

`<skill-root>` is the `spec-workflow` skill directory
(`~/.copilot/skills/spec-workflow` for a user-scope install). Read the profile and quality
commands from `.spec-workflow.yml` per
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

## 1. Load the plan completely

- Read the whole file before editing anything: frontmatter, goals, affected modules, steps,
  checkpoints, verification plan, open questions, checklist, existing notes.
- Read the affected source files and their tests, plus the documentation the plan says must
  change.
- Resolve every open question that the plan left for implementation time: answer it from the
  code when possible, otherwise ask the user. Tick the box and record the decision inline.
- `spec_plan.py checklist <REF>` lists what remains when resuming.

If the plan contradicts the code (a function was removed, an API changed), stop and report —
do not silently re-plan.

## 2. Mark the plan in progress

```
python3 <skill-root>/scripts/spec_plan.py set-status <REF> in-progress
```

The script also moves the file out of `draft/` when the repository uses that split. Verify
the printed path before continuing. On a resume this is a no-op.

## 3. Execution loop — one step at a time

For each unchecked step, in order:

1. **Read** the step and the files it names.
2. **Implement** the smallest coherent change that completes the step. No opportunistic
   refactors, no new abstractions the plan did not describe, no dependency added unless the
   plan lists it.
3. **Write the test** for the new or changed behaviour. New test file, mirroring the source
   layout, unless the plan says otherwise. Never modify an existing test to make it pass —
   if an existing test legitimately must change, ask first.
4. **Verify** exactly what the step says, plus a targeted check of the touched files
   (build, type-check, or the narrowest test selection that covers them). Fix failures
   before advancing.
5. **Tick the checkbox** for the step in the plan, immediately. The checklist is a progress
   log, not decoration — it is what makes an interrupted session recoverable.
6. **Record the deviation**, if any, in `## Implementation Notes` (see below).

Never batch several steps and fix everything at the end. Never leave a ticked step that does
not pass its own verification.

### Checkpoints

If the plan contains a `🔶 CHECKPOINT CP-N` block, stop when you reach it:

1. Run the full quality suite, not just targeted checks.
2. Report the checkpoint label, what now works, how the user can verify it, and the exact
   command to continue.
3. Wait for explicit confirmation. Do not continue on silence or on an earlier approval.

## 4. Scope boundary

- Modify only files listed under `## Affected modules`. Files marked `(maybe)` need explicit
  permission.
- New out-of-scope file needed? Stop and ask. State the file, the reason, and the smallest
  alternative.
- Pre-existing failures in a touched module are yours to fix; failures in untouched modules
  are reported, not fixed.
- Do not delete or rewrite unrelated code, comments, formatting, or configuration.

## 5. Implementation Notes

Keep a `## Implementation Notes` section at the end of the plan (create it on first need,
append on later runs). Log everything the next reader needs:

- **Decisions** — a choice the plan left open, with the reason.
- **Deviations** — a different approach forced by reality; say what the plan said and why it
  changed.
- **Discoveries** — pre-existing defects, missing docs, surprising behaviour encountered.
- **Extensions** — anything added beyond the plan, and who approved it.

You may add or update `## Implementation Notes` freely. You may **not** edit goals, steps,
affected modules, or the checklist structure. If the plan itself is wrong, stop and ask the
user to revise it with `spec-plan`.

## 6. Final gate

1. `spec_plan.py checklist <REF>` reports every item ticked (exit 0).
2. The full quality suite from the profile passes — run it, paste the command and the
   outcome, do not infer.
3. Documentation listed under Affected modules is actually updated.
4. `python3 <skill-root>/scripts/spec_plan.py validate <REF> --strict` exits 0.

If any item fails, it is not done. Never tick the closing items to satisfy the gate.

## 7. Hand off

Report:

- plan path and status
- files created / modified / deleted
- steps completed, and anything deferred
- quality commands run with their results (pass/fail per category)
- deviations and extensions
- the single next command — `spec-review <NNN>`

Stop there. Do not review your own work, do not mark it `reviewed`, do not archive it.

## Resuming

Status `in-progress` means someone started before. Then:

1. Read the plan and `## Implementation Notes` in full.
2. Run `checklist` to list unticked items.
3. Inspect the working tree (`git status`, `git diff`) — the code may be ahead of or behind
   the checklist.
4. Continue from the first unticked item, after verifying that the ticked work still passes.
   Never redo completed steps, and never assume uncommitted changes are yours.

## Guardrails

- Never create plans, change plan intent, or bump versions.
- Never review, score, or close the work; that is a separate phase with its own gate.
- Never run `git commit`, `git push`, or any history-changing Git command unless the profile
  sets `git.allow_writes: true`; suggest a commit message instead.
- Never report success from an unexecuted command.
