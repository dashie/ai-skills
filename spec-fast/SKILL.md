---
name: spec-fast
description: 'Implement a small, well-defined change immediately, review it against the original request, and create a concise retrospective tech plan. Use when the user says "spec-fast" followed by a change or asks to continue an existing fast plan. Repeat implementation and review as requested; never close automatically.'
argument-hint: '<change description | plan reference and follow-up>'
---

# Spec-Fast — Implement, Review, Record

Use the fast lane for a small, low-impact change with an unambiguous outcome and a
verifiable scope. Implement first, review the result in a separate pass against the user's
request, then write a concise retrospective plan. The user decides when to close.

The retrospective plan exists because the user explicitly invoked `spec-fast`; it is the
only record this lane creates. Never create a second plan: work that outgrows the lane is
proposed as a `spec-plan` request and waits for the user.

This is one of the explicit exceptions to the one-phase-per-invocation rule in
[../spec-workflow/SKILL.md](../spec-workflow/SKILL.md), with `spec-auto` and
`spec-implement-and-review`. It does not invoke or change the contracts of the individual
phase skills. All other shared gates and Git rules still apply.

## 0. Pre-flight

1. Resolve the project profile, plan directories and quality commands as described in
   [../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).
   Ask for missing information rather than inventing it. Use `aispec plan config` to inspect
   the helper's resolved paths and settings.
2. Read the original request and the relevant code, tests and documentation. Identify the
   intended outcome, exclusions, risks and how to verify it. Ask before acting if a
   consequential design or behaviour decision is unresolved.
3. Use `aispec plan list --status all` to check for overlapping plans and dependencies.
   When continuing a fast plan, exclude that specific plan from the duplicate check. If
   another plan already covers the work or an open dependency blocks it, stop and ask how
   to proceed; do not silently create a duplicate or bypass a dependency.
4. Inspect the working tree, including staged, unstaged and untracked files. Establish what
   belongs to this request without attributing existing changes to it. If changes overlap
   and cannot be separated reliably, ask the user before editing or reviewing them.
5. If the task is not small and low-impact, needs an architectural decision, migration,
   security remediation, or significant scope discovery, stop and recommend `spec-plan`;
   never create that plan yourself.
   If this becomes apparent later, preserve the work and record its current state before
   stopping; do not silently expand scope.

## 1. Implement and verify

- Implement the smallest change that satisfies the request, following existing patterns.
- Add or update focused tests for changed behaviour and update directly affected docs.
- Run targeted checks, then the project's full quality suite. Record exact commands and
  outcomes, including failures and checks that could not run. Never claim an unrun check
  passed.
- If blocked, interrupted, or checks fail, preserve the work and create the retrospective
  record in `in-progress` as soon as possible. Leave incomplete checklist items unticked and
  report the blocker; do not mark the work reviewed.

## 2. Review against the request

Perform a distinct review pass over the actual change, not just the implementation summary.
Compare it with the original request and agreed follow-ups, inspect the scoped diff and
untracked files, and verify behaviour, edge cases, errors, tests, documentation, security
and unintended scope. Review only the changes attributable to this task.

Use the quality suite and verdict criteria from [../spec-review/SKILL.md](../spec-review/SKILL.md):
any blocker or major finding, unmet goal, failing or unrun required quality check means
`NEEDS WORK`. Record concrete evidence, findings, limitations and any documentation fixes.
Do not treat the retrospective plan as independent evidence of the original request.

If review finds a defect, retain its findings and `NEEDS WORK` verdict, fix it within the
agreed scope and repeat the affected checks and the review. If it cannot be resolved, record
`NEEDS WORK` and stop. No review is independent of its author merely because it is a
separate pass; do not claim otherwise.

## 3. Write the retrospective plan

Create the record after the implementation and review, or earlier on a blocker as described
above. Get the number with `aispec plan next-number` and use the configured filename and
draft directory. Start with `status: draft`, then use the helper for every status change.

Use [../spec-workflow/assets/tech-plan-template.md](../spec-workflow/assets/tech-plan-template.md)
and the profile's required fields and sections, but keep the content concise. Label it
**retrospective** and distinguish the original request and agreed decisions from later
reconstruction. Never present invented intent, checks, decisions or timestamps as fact.
Include:

- the original request, motivation, observable goals and non-goals;
- actual affected files, solution and decisions with reasons, including limitations;
- actual implementation steps, exact verification commands and outcomes;
- an honest checklist, `## Implementation Notes` and any unresolved work;
- version bump only when supported by the project convention or an explicit user decision.

Run `aispec plan validate <REF>` and fix errors. Then:

```
aispec plan validate-for implement <REF>
aispec plan set-status <REF> in-progress
aispec plan validate-for review <REF> --strict
```

These gates do not imply that a retrospective plan was approved before implementation.
For each completed review round, append `## Review Notes` in the format specified by
`spec-review`, including the exact `**Verdict**: PASS` or `**Verdict**: NEEDS WORK`,
findings, gap analysis and executed quality evidence. Never overwrite prior review rounds.

For `PASS`, record `**Reviewed state**` (`aispec plan fingerprint`) in the notes. Only when
the full review and quality suite passed and `validate-for review <REF> --strict` still
succeeds, run
`aispec plan set-status <REF> reviewed`. Otherwise leave `in-progress`, report why and do
not fabricate a PASS. If the record or a required helper operation cannot be created or
validated, stop and report the blocker and the work already performed.

## 4. Continue an open fast plan

When the user requests another iteration, resolve the specific plan with `aispec plan show`
and read it and its review history. Ask if the reference or scope is ambiguous. A `done`
plan stays archived: propose a new plan referencing it and create it only when the user
explicitly asks for `spec-plan`, instead of rewriting history.

For a `reviewed` plan, run `aispec plan set-status <REF> in-progress` **before** any
substantive edit, so the previous PASS cannot authorize close. An `in-progress` plan stays
in progress. Record the new request and agreed scope, append rather than rewrite past
decisions and review notes, and update the affected modules, goals and checklist to include
the new work. Untick checks invalidated by the iteration. Preserve the earlier record and
review rounds.

Implement, verify and review the new iteration as above, including the complete current
change and all original and added goals. Append Implementation Notes and a new Review Notes
round. A fresh PASS and all checklist and validation gates are required to return to
`reviewed`; otherwise remain `in-progress`. If the follow-up exceeds fast-lane scope, stop
and propose a separate `spec-plan`, then wait for the user to ask for it instead of creating
it yourself.

## 5. Handoff and close

Report the plan path and status, changed files, verification results, review verdict,
limitations and any blockers. The user may request another iteration. Only when satisfied
may they explicitly run `spec-close <REF>`; this skill never closes, archives, bumps a
version, commits or pushes automatically. `spec-close` checks the latest PASS and that the code is unchanged since the review
(`**Reviewed state**`); if it changed, obtain a fresh review before close.

Use `aispec plan` for all plan operations it supports; never hand-edit status or bypass a
failed gate. Do not silently include unrelated work or report success for unverified work.
