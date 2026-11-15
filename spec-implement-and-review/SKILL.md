---
name: spec-implement-and-review
description: 'Close the small, mechanical findings of a review in a single pass: run the spec-implement contract on those findings, then the spec-review contract, and end with a PASS or NEEDS WORK verdict. Use when the user wants to fix review findings and re-review without verifying the fix in between, says "spec-implement-and-review", "implement-and-review", "implement and review", "sistema i finding e rifai la review". Only for in-progress plans whose open findings are small, mechanical and low-risk; complex, risky or decision-bearing findings keep the separate spec-implement → user check → spec-review path. It never plans, never creates plans, and never closes.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Implement-and-Review — Fix the Findings, Then Verify Them

`spec-implement` and `spec-review` normally run as two invocations, with the user looking at
the result in between. For a small, mechanical finding that inspection adds nothing to, this
skill performs both contracts back to back and reports a single verdict.

It is a shortcut for the user, never a shortcut in the evidence: the review pass is as
demanding as a standalone `spec-review`, and it never awards a PASS it did not execute.

## Position in the workflow

```
spec-implement ──► spec-review ──PASS──► spec-close
        ▲               │
        └──NEEDS WORK───┘

spec-implement-and-review ≡ (spec-implement on the open findings) ──► (spec-review)
```

This is an explicit, documented exception to the one-phase-per-invocation rule in
[../spec-workflow/SKILL.md](../spec-workflow/SKILL.md), like `spec-fast`. It does not change
the contract of any phase skill: it applies the existing ones and stops for the user exactly
where they would have stopped.

## 0. Route: is this the right lane?

Read the plan and its latest `## Review Notes` first, then classify every open finding.

| Belongs in this lane | Does not belong |
|---|---|
| Typo, stale or misleading comment, unclear name | Any behaviour, API, schema, migration or configuration change |
| Missing import, dead leftover, broken link | Security remediation, dependency addition or upgrade |
| Documentation that is stale or incomplete for the delivered change | New scope, feature, refactor or abstraction the plan did not describe |
| Test coverage gap for behaviour the plan already delivered | A finding that needs a product, architecture or trade-off decision |
| Re-running a check that failed for an environmental reason | Anything the user should inspect before it is reviewed |

If a finding is not clearly in the left column, it does not belong here. If the user asks for
this lane on work that is not small and mechanical, stop, list the findings that disqualify
it, and name `spec-implement <REF>` instead: those findings need the user to verify the fix
before the review. Mixed sets are not split either — one disqualifying finding moves the
whole round to the separate phases.

## 1. Pre-flight — gates before touching anything

```
aispec plan validate-for implement <REF>
```

The gate accepts `draft` and `in-progress`. This lane requires `in-progress`: a plan whose
latest verdict is `NEEDS WORK`, or whose implementation was interrupted. If the status is
`draft`, stop and name `spec-implement <REF>`: first-time implementations are not a fix
round. On any other gate failure, stop, report the exact error, and name the command that is
allowed instead. Never force a gate.

`<skill-root>` is the `spec-workflow` skill directory
(`~/.copilot/skills/spec-workflow` for a user-scope install). Read the profile and quality
commands from `.spec-workflow.yml` per
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

Then:

- Read the plan completely: goals, affected modules, steps, checklist, `## Implementation
  Notes`, every `## Review Notes` round. Only the latest verdict counts.
- Build the list of findings to close, by number and severity, from that latest round. Do not
  carry forward findings marked `fixed in review`.
- Inspect the working tree (`git status`, `git diff --stat`) so uncommitted work is not
  mistaken for yours.
- If the plan still contains an unreached `🔶 CHECKPOINT`, stop: checkpoints exist to be
  verified by the user, which is the opposite of what this lane is for.

## 2. Fix pass — the `spec-implement` contract, restricted to the findings

Follow [../spec-implement/SKILL.md](../spec-implement/SKILL.md) in full, with this scope:

- Close only the findings listed in §1. No opportunistic cleanup, no refactor, no new
  abstraction, no dependency the plan did not list.
- Tick only the checklist items those findings actually complete; leave the rest untouched.
- Add or update a test only where the finding is a coverage gap. Never modify an existing
  test to make it pass.
- Verify: targeted checks for the touched files, then the full quality suite from the
  profile. Fix failures before moving on.
- Append one `## Implementation Notes` entry per finding, referencing its number, what
  changed and how it was verified. Record any deviation instead of silently taking it.

If a fix turns out to need a decision or a behaviour change, stop before writing it: the
finding was misclassified. Report it and hand the round back to the separate phases.

## 3. Hand-off gate between the two phases

```
aispec plan validate-for review <REF>
```

Must pass before any review work starts; the fix pass leaves the plan `in-progress`. If it
fails, stop and report — do not review a plan the gate rejects.

## 4. Review pass — the `spec-review` contract, unchanged

Follow [../spec-review/SKILL.md](../spec-review/SKILL.md) in full: establish the change set
from the diff, run the quality suite, walk the verification matrix with evidence, perform the
gap analysis, repair the documentation this change made stale, assign severities, append a
new `## Review Notes` round, and update the status.

Two rules specific to this lane:

- **The review is not independent.** You implemented what you are reviewing, in this same
  session. Do not treat your fix pass as evidence: base the verdict on the executed commands,
  the diff and the plan. Re-run the full quality suite in the review pass; you may cite the
  fix-pass run for the same unmodified tree only if you say so explicitly.
- **Findings found now are reported, not patched.** Blockers and majors in code, tests or
  scope go back to `spec-implement`. The review pass may only correct documentation (as
  `spec-review` allows) and, with the user's permission, the minor fixes it listed. Finding a
  new defect in your own fix is a legitimate outcome of this lane; hiding it is not.

## 5. Verdict and stop

- **PASS** → `aispec plan set-status <REF> reviewed`, then tell the user the next command is
  `spec-close <NNN>`.
- **NEEDS WORK** → leave the status `in-progress` and report the findings. One
  implement-and-review round per invocation: do not start another fix pass unasked.

Also stop and escalate when the same finding survives two rounds, or when the plan has been
through three review rounds: the plan, not the code, is usually wrong by then.

## 6. Report

In this order: routing decision (why the findings qualified), findings closed with the
evidence, gate results, quality table, verification matrix and gap analysis in brief,
findings by severity, verdict, next command. Factual, no praise, no tour of the code.

## Guardrails

- Use `spec-plan.mjs` for every supported plan operation — gates, checklist, status changes.
  Never hand-edit status or reproduce a helper check; if the helper cannot do it, stop and
  report the blocker.
- Never plan, create a plan, revise plan intent, bump a version, write a changelog, archive,
  or run a history-changing Git command. Closing belongs to `spec-close`.
- Never mark `reviewed` without a fresh PASS backed by commands you executed in this
  invocation.
- Never skip the review pass, never merge it into the fix pass, and never let it fix blockers
  or majors in code.
- Never widen scope to make a finding disappear, and never claim a check passed that you did
  not run.
