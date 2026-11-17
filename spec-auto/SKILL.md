---
name: spec-auto
description: 'Execute a whole tech plan and review it in one invocation, without stopping between implementation and review: every step, the quality suite, the verification matrix, the gap analysis and a PASS or NEEDS WORK verdict. Use when the user wants unattended end-to-end work starting from a plan, says "spec-auto", "esegui il piano fino alla review", "implementa e rivedi senza fermarti", "lavora in autonomia fino alla review", or asks to run a plan on a remote/unattended machine. Only for a plan in draft or an interrupted in-progress plan with no review round yet; after a NEEDS WORK verdict the next step is spec-implement-and-review or spec-implement. It never plans, never creates a plan, and never closes.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Auto — Execute the Plan, Then Review It

`spec-implement` and `spec-review` normally run as two invocations with the user looking at
the result in between. On an unattended machine nothing is inspected in that gap, so this
skill runs both contracts back to back and ends with the review verdict.

What it removes is the hand-off. What it keeps is the gate: the review pass is as demanding
as a standalone `spec-review`, the plan ends `reviewed` only on a PASS backed by commands
executed in this invocation, and closing still belongs to the user and `spec-close`.

## Position in the workflow

```
spec-plan ──draft──► spec-auto ≡ (spec-implement) ──► (spec-review) ──► verdict
                          ▲                                │
                          └──── one mechanical fix round ───┤ NEEDS WORK
                                                           └──► PASS → spec-close
```

This is an explicit, documented exception to the one-phase-per-invocation rule in
[../spec-workflow/SKILL.md](../spec-workflow/SKILL.md), like `spec-fast` and
`spec-implement-and-review`. It applies the existing phase contracts; it does not change
them.

## 0. Route: which plans belong here

| Plan state | Lane |
|---|---|
| `draft` | **this lane** — full run |
| `in-progress` with no `## Review Notes` yet (interrupted) | **this lane** — full run from the first unticked step |
| `in-progress` with a latest `NEEDS WORK` verdict | `spec-implement-and-review` when every finding is small and mechanical, otherwise `spec-implement` |
| `in-progress` with a latest `PASS` verdict (plan extended after review) | `spec-implement` |
| `reviewed` | `spec-implement` (to extend it) or `spec-close` |
| `done` | nothing — already archived |

This lane is never a fix round and never an extension: a plan a review already judged goes to
`spec-implement-and-review` or `spec-implement`, so the findings stay the scope and the verdict
history stays honest. If the user asks for `spec-auto` on such a plan, stop and name the
allowed command.

## 1. Pre-flight — gates and baseline

```
aispec plan validate-for implement <REF>
```

Accepts `draft` and `in-progress`, and verifies that every `depends_on` plan is `done`. On
failure: stop, report the exact error, name the command that is allowed instead. Never force
a gate.

`<skill-root>` is the `spec-workflow` skill directory
(`~/.copilot/skills/spec-workflow` for a user-scope install). Read the profile and quality
commands from `.spec-workflow.yml` per
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

Then, before touching anything:

- Read the plan completely: goals, affected modules, steps, checkpoints, verification plan,
  open questions, checklist, notes.
- Resolve every open question the code can answer; tick the box and record the decision
  inline. A question that needs the user is a blocker (§2) — do not answer it on their
  behalf.
- Record the review baseline so the later review can establish the change set: current
  branch, `git merge-base` with the default branch, `git status --porcelain`, and
  `git diff --stat`. Uncommitted work found here is not yours; note it.
- List the `🔶 CHECKPOINT` blocks. In this lane they are crossed, not waited on (§2).

## 2. Implementation pass — the `spec-implement` contract

Follow [../spec-implement/SKILL.md](../spec-implement/SKILL.md) in full, with two changes.

**Checkpoints do not stop the run.** When you reach `🔶 CHECKPOINT CP-N`: run the full
quality suite, record in `## Implementation Notes` the checkpoint label, what now works, how
to verify it, and the command to continue — then proceed with the next step. Every crossed
checkpoint is reported in §7; narrowing or deleting one is never allowed.

**"Ask" degrades to "stop and report".** Wherever `spec-implement` says to stop and ask the
user — an out-of-scope file, a plan that contradicts the code, a question only the user can
answer, an existing test that must change, a design decision the plan never took — stop the
whole run. Leave the plan `in-progress`, tick only what is genuinely done, and report the
blocker with its smallest alternative. Never widen scope, never invent an approval, never
re-plan silently.

Everything else is unchanged: one step at a time, a test for new or changed behaviour, the
step's `Verify:` line plus a targeted check, the checkbox ticked immediately, deviations and
discoveries written to `## Implementation Notes`, and the scope boundary of *Affected
modules* respected.

## 3. Hand-off gate before the review

```
aispec plan validate-for review <REF> --strict
```

The gate (status, valid plan, fully ticked checklist) must pass before any review work starts: a run that leaves unticked items or an
invalid plan is a failed run, not a review input. If one fails, stop and report — do not
review a plan the gate rejects, and do not tick the closing items to make the gate happy.

## 4. Review pass — the `spec-review` contract, honestly self-reviewed

Follow [../spec-review/SKILL.md](../spec-review/SKILL.md) in full: establish the change set
from the diff, run the quality suite, walk the verification matrix with evidence, perform the
gap analysis, repair the documentation this change made stale, assign severities, append a
new `## Review Notes` round, and update the status.

Rules specific to running it in the same invocation as the implementation:

- **Disclose it.** The review block states that round N is a self-review performed in the
  same invocation as the implementation. Never let the plan imply an independent reviewer.
- **Your own pass is not evidence.** `## Implementation Notes`, your memory of intent and the
  implementation report are claims to verify, not proof. The verdict rests on the diff, the
  plan text and the commands you executed.
- **Re-run the full quality suite** in the review pass. Citing the implementation run is
  allowed only when the tree is unmodified since that run, and only if you say so explicitly.
- **Documentation repairs stay allowed** — `spec-review` §6 needs no permission for them.
- **Minor fixes are not applied.** The permission `spec-review` requires cannot be obtained
  here: list the minor findings in the `## Review Notes` table and leave the code alone.
- **The review pass never patches code.** Blockers and majors go to the fix round (§5) or
  back to `spec-implement`; hiding, downgrading or pre-fixing a defect in the review pass is
  forbidden.

## 5. One automatic fix round

When the verdict is `NEEDS WORK`, this lane may run exactly one more fix round, and only when
**every** finding qualifies:

| Qualifies | Disqualifies |
|---|---|
| Typo, stale or misleading comment, unclear name | Any behaviour, API, schema, migration or configuration change |
| Missing import, dead leftover, broken link | Security remediation, dependency addition or upgrade |
| Documentation stale or incomplete for the delivered change | New scope, feature, refactor or abstraction the plan did not describe |
| Test coverage gap for behaviour the plan already delivered | A finding that needs a product, architecture or trade-off decision |
| A check that failed for an environmental reason | Anything the user should inspect before it is reviewed |

Then: run the fix pass restricted to those findings under the `spec-implement` contract,
re-run the checks, and append a second `## Review Notes` round with its own verdict. One extra
round per invocation, never two.

If any finding disqualifies, or the second round is still `NEEDS WORK`, stop: leave the plan
`in-progress` and name the next command — `spec-implement <NNN>` for anything that needs a
decision or a behaviour change, `spec-implement-and-review <NNN>` when the remaining findings
are all mechanical.

Stop and escalate to the user when the same finding survives two rounds, or when the plan has
been through three review rounds: the plan, not the code, is usually wrong by then.

## 6. Status and stop

- **PASS** → `aispec plan set-status <REF> reviewed`; report that the next command is
  `spec-close <NNN>`.
- **NEEDS WORK** → leave the status `in-progress` (do not touch it) and report the findings.

Never mark `reviewed` without a PASS you executed in this invocation, and never close, bump a
version, write the changelog or archive — that is `spec-close`, on the user's request.

## 7. Report

In this order: lane decision and entry status, files created / modified / deleted, steps
completed and anything deferred, checkpoints crossed (label, what works, how to verify),
quality table for both passes, verification matrix and gap analysis in brief, findings by
severity, the self-review disclosure, verdict, next command. Factual, no praise, no tour of
the code.

## Guardrails

- Use `spec-plan.mjs` for every supported plan operation — gates, checklist, validation,
  status changes. Never hand-edit status or reproduce a helper check; if the helper cannot do
  it, stop and report the blocker.
- Never plan, create a plan, revise plan intent, bump a version, write a changelog, archive,
  or run a history-changing Git command. New work the user asks for during the run joins this
  plan through the extension rules of `spec-implement` §5, never a new plan.
- Never skip or shorten the review pass, never merge it into the implementation pass, and
  never let the review pass fix blockers or majors in code.
- Never exceed one automatic fix round, and never loop until PASS on your own initiative.
- Never cross a checkpoint silently: every one is recorded, verified and reported.
- Never widen scope to make a finding disappear, never report success from an unexecuted
  command, and never claim an independence the single-session review does not have.

## Outputs

- The plan with a complete checklist, `## Implementation Notes`, one or two `## Review Notes`
  rounds, and status `reviewed` or `in-progress`.
- A report ending with the single next command, `spec-close <NNN>` or `spec-implement <NNN>`.
