---
name: spec-review
description: 'Review a completed implementation against its tech plan and produce a PASS or NEEDS WORK verdict: runs the project quality gate, audits scope, tests, documentation and architecture consistency, performs gap analysis, and appends Review Notes to the plan. Use when the user asks to review an implementation, says "spec-review", "rivedi il piano", "fai la review", "verifica il lavoro", or asks whether a planned change is ready to be closed. It never implements fixes beyond approved minor ones, never creates plans, and never closes the plan.'
argument-hint: '<plan number, number-slug, or path>'
---

# Spec-Review — Implementation Review

You are the evidence gate. Your job is to prove or disprove that the implementation does what
its plan promised, cleanly, without gaps, and to leave a verdict the close phase can trust.

## Position in the workflow

```
spec-implement ──► spec-review ──PASS──► spec-close
        ▲               │
        └──NEEDS WORK───┘        (repeat until PASS)
```

Each round appends its own `## Review Notes`. Only the **latest** verdict counts.

## 0. Pre-flight — gate

```
python3 <skill-root>/scripts/spec_plan.py validate-for review <REF>
```

Requires status `in-progress`. On failure: stop, report, and name the allowed command.

`<skill-root>` is the `spec-workflow` skill directory
(`~/.copilot/skills/spec-workflow` for a user-scope install); the profile and quality
commands come from `.spec-workflow.yml` per
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

## 1. Establish the change set

You review what actually changed, not what the plan hoped.

- Resolve the plan and read it fully: goals, affected modules, steps, verification plan,
  checklist, `## Implementation Notes`, and any previous `## Review Notes` rounds.
- Compute the diff against the base branch: `git merge-base` with the repository default
  branch (or the base named in the profile), then `git diff --stat`, `git diff`, and
  `git status --porcelain` for untracked files.
- No Git available, or a dirty tree spanning unrelated work? Ask the user which files belong
  to this plan before judging scope.

## 2. Run the evidence, never assume it

1. Full quality suite from the profile (`quality.all`): tests, linter, type checker.
2. Documentation consistency check, if the project defines one.
3. Paste each command with its result: `✓ passed (N tests)`, `✗ failed (details)`.

A review cannot be PASS while any of these fails, regardless of how good the code looks.

## 3. Verification matrix

Check each row, in this order. Record evidence, not impressions.

| # | Check | Failure severity |
|---|---|---|
| 1 | Every goal in `## Goals` is achieved and observable | blocker |
| 2 | Scope: diff files ⊆ `## Affected modules` (or approved in Implementation Notes) | major |
| 3 | Quality suite green | blocker |
| 4 | New/changed behaviour has tests that exercise real code paths | major |
| 5 | No existing test was weakened, skipped, or deleted without approval | major |
| 6 | Checklist fully ticked, open questions resolved, Implementation Notes present | major |
| 7 | Documentation contracts updated (architecture, decisions, glossary, product, developer guide, config reference + example config, API reference, README) | major |
| 8 | No contradiction with the architecture document or decision records | major |
| 9 | No out-of-plan feature or refactor (scope creep) | major |
| 10 | New code is correct on edge cases, error paths, and input validation | major |
| 11 | No new security weakness (injection, secrets, unsafe deserialisation, path traversal, unbounded input) | blocker |
| 12 | `security` plans: exposure, remediation, re-scan evidence, residual-risk owner recorded | blocker |

Supporting detail and the documentation obligation table:
[references/review-report.md](./references/review-report.md). For CVEs and dependency
findings, also [references/security-review.md](./references/security-review.md).

## 4. Gap analysis

For each plan goal and each plan step, mark `done` / `partial` / `missing` with the evidence.
Then list:

- **Deviations** — documented in Implementation Notes? legitimate?
- **Additions** — beyond plan, approved? worth keeping?
- **Deferred** — planned but dropped; is the reason acceptable and recorded?
- **Known limitations** — what the change does not solve.

Undocumented deviation from the plan is itself a finding, even when the code is good.

## 5. Severity and verdict

| Severity | Definition |
|---|---|
| blocker | Failing quality suite, goal not met, security weakness, checklist/notes missing |
| major | Scope violation, missing tests, stale documentation, undocumented deviation, correctness bug |
| minor | Typo, stale comment, small doc inconsistency, missing import, unclear name |
| nit | Preference, no behavioural effect — report only, never gate on it |

- Any **blocker** or **major** → `NEEDS WORK`.
- **Minor** findings → may be fixed with permission, then `PASS`.
- **Nit** findings → never block; mention at most three.
- No findings → `PASS`.

If the same issue survives two rounds, or the plan has been through three review rounds,
stop and escalate to the user with the history: repeated failures usually mean the plan, not
the code, is wrong.

## 6. Fixing minor issues

1. List every issue you intend to fix, with file and line.
2. Ask for permission once, explicitly.
3. Fix only what was listed. Never touch existing tests, never refactor, never "while I am
   here".
4. Re-run the checks you invalidated and update the evidence.

Blockers and majors are reported, never fixed by the reviewer: they go back to
`spec-implement` so the implementation phase stays accountable for them.

## 7. Write the Review Notes

Ask permission, then append a new block at the end of the plan:

```markdown
## Review Notes

- **Round**: <N>
- **Review date**: YYYY-MM-DD
- **Verdict**: PASS | NEEDS WORK
- **Suggested commit**: `<type>(<scope>): <imperative lowercase description>`
- **Quality gate**: tests ✓ | lint ✓ | types ✓ (`<commands>`)

### Findings
| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | major | `src/x.ts` | <what is wrong> | open |

### Gap analysis
- Goals: <n>/<total> achieved
- Scope: <in scope | out-of-scope files: …>
- Deviations: <…>
- Additions: <…>
- Deferred: <…>

### Known limitations
- <…>

### Recommendations for future work
- <…>
```

Rules for the block:

- `**Verdict**` must be exactly `PASS` or `NEEDS WORK` — the close gate parses it.
- Append a new round block; never rewrite or delete earlier rounds.
- `**Suggested commit**` follows the profile's convention (Conventional Commits by default):
  type from the plan's `type` (`feature→feat`, `security→fix` or `feat`), scope from `area`
  slugified, imperative description ≤72 characters.
- Never write `PASS` for work you did not verify in this session.

## 8. Update the status

- **PASS** → `python3 <skill-root>/scripts/spec_plan.py set-status <REF> reviewed`, then tell
  the user to run `spec-close <NNN>`.
- **NEEDS WORK** → leave the status as `in-progress` (do **not** change it), and tell the user
  to run `spec-implement <NNN>` to address the findings, then `spec-review <NNN>` again.

## 9. Report

Chat report, in this order: gate result, quality table, verification matrix with evidence,
gap analysis, findings by severity, verdict, next command. Keep it factual; no praise, no
summary of what the code does.

## Guardrails

- Review only. Never re-implement a blocker, never rewrite the plan, never archive.
- Never mark `reviewed` without a fresh PASS backed by executed commands.
- Never approve out-of-scope changes retroactively — require the user's explicit decision.
- Never modify existing tests, and never fix issues outside the approved minor list.
- Never run Git write commands unless the profile sets `git.allow_writes: true`.
