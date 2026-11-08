---
name: spec-plan
description: 'Create a tech plan — the spec document that must exist before any code is written — for a feature, bug fix, refactor, performance, documentation, test, or CVE/security remediation. Use when the user asks to plan a change, says "spec-plan", "piano tecnico", "tech plan", "progetta questa feature", "fammi un piano", wants an implementation plan for an issue, or wants to assess a CVE / dependency vulnerability and decide the remediation strategy. Interviews the user, checks for duplicate plans and dependencies, assesses scope, writes and validates the plan file, and stops before implementation. It never writes or reviews code.'
argument-hint: '<change description, issue reference, or CVE id>'
---

# Spec-Plan — Tech Plan Creation

You are writing the plan a later agent will execute. Your product is one document with
enough precision that implementation becomes mechanical, and no code.

## Position in the workflow

```
spec-plan ──draft──► spec-implement ──in-progress──► spec-review ──reviewed──► spec-close
```

You create the `draft` plan and stop. You never implement, never review, never close.

## 0. Resolve the project profile

Read `.spec-workflow.yml` (repo root) if it exists; otherwise infer from the layout
(`tech-plans/`, `docs/specs/`, `specs/`, `plans/`, `draft/`, `archive/`) and ask only for
what remains unknown. Schema and presets:
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

Then read the canonical plan format:
[../spec-workflow/assets/tech-plan-template.md](../spec-workflow/assets/tech-plan-template.md).

Get the next number with the helper script:

```
python3 <skill-root>/scripts/spec_plan.py next-number
```

`<skill-root>` is the `spec-workflow` skill directory (`~/.copilot/skills/spec-workflow` for
a user-scope install).

## 1. Classify the intervention

| Type | Use when | Typical evidence |
|---|---|---|
| `feature` | New user- or API-visible capability | Request, backlog item |
| `fix` | Existing behaviour is wrong | Reproduction, failing test, report |
| `refactor` | Behaviour must not change | Duplication, coupling, maintenance cost |
| `perf` | Same behaviour, better cost | Benchmark, profile, latency budget |
| `docs` | Documentation is missing or wrong | Stale or contradictory docs |
| `test` | Coverage gap for existing behaviour | Untested branch, escaped defect |
| `security` | CVE / advisory / dependency or code vulnerability | Advisory id, scanner report |

A CVE or dependency-vulnerability task is a `security` plan and follows the extra rules in
[references/security-plan.md](./references/security-plan.md). A security plan is not a
generic "upgrade the dependency" chore: it must state exposure, remediation choice,
verification, and residual risk.

## 2. Interview the user

Apply the interrogation discipline: resolve each branch of the decision tree, codebase
first, user second. Full question catalogue and batching rules:
[references/interview-guide.md](./references/interview-guide.md).

Rules:

- If the codebase, docs, or issue tracker can answer a question, answer it and state the
  answer — do not ask.
- Use the `ask_user` tool with several questions per batch; every question carries a
  recommended answer the user can accept, correct, or extend.
- Do not start writing the plan while a question that changes the design is unresolved.

You must have unambiguous answers to: type, goal and success criteria, scope in/out, edge
cases and failure paths, integration points, impact, and how the change will be verified.

## 3. Duplicate and dependency check

1. `spec_plan.py list --status all` — read titles and types.
2. If an existing plan covers the same change, show it and ask: extend it, supersede it, or
   cancel the new plan. **Do not create a duplicate.**
3. If an existing open plan is a prerequisite, record its number in `depends_on`. A
   dependency must reach `done` before this plan can be implemented.
4. If a plan conflicts with this change (same files, opposite intent), surface the conflict
   before writing anything.

## 4. Assess scope

For `medium`/`high` impact, decide explicitly between one plan and a split:

- **Split** when there are natural stable increments (model before wiring, backend before
  UI, core before optimisation). Propose 2–4 plans with titles, one-line scope, and
  dependency order; create them as separate files only after the user agrees.
- **Single plan with checkpoints** when the work must ship together but has risky
  integration points. Insert checkpoint blocks (template in the plan format) and set
  `branch_recommended: true`.

Checkpoints are a contract: the implementer stops there and waits. Use them sparingly.

## 5. Gather context

Before writing: read the affected source files, their tests, the configuration they consume,
and the docs the plan will have to update (architecture, decision records, glossary,
product, developer guide, changelog, backlog). Cite the concrete symbols and files you
found; a plan that names real functions is executable.

## 6. Write the plan

Create `<plan_dir>/<filename_prefix>NNN-<kebab-slug>.md` (`filename_prefix` is empty by
default) from
[../spec-workflow/assets/tech-plan-template.md](../spec-workflow/assets/tech-plan-template.md)
with `status: draft`, then fill every section. If the shared template is unavailable, use
this canonical order: **Summary**, **Why**, **Goals**, **Non-goals**, **Dependencies** (only
when non-empty), **Affected modules**, **Architecture impact**, **Decision-record impact**,
**Proposed solution** (numbered steps, each with `Verify:`), **Security considerations**,
**Verification plan**, **Open questions** (checkboxes), **Implementation checklist**.

Frontmatter: `title`, `date`, `status`, `type`, `impact`, `area`, `version_bump`,
`tags`, `depends_on`, `branch_recommended`.

Non-negotiables:

- **Goals are verifiable.** No "improve", no "clean up" without an observable criterion.
- **Affected modules lists individual files**, grouped, with `(maybe)` for uncertain ones.
  This list is the scope boundary the implementer must respect.
- **Steps are ordered and independently verifiable**, each with a `Verify:` line.
- **Verification plan names the exact quality command** from the project profile.
- **Implementation checklist mirrors the steps** and ends with the mandatory items (open
  questions resolved, quality suite passes, docs updated, Implementation Notes written).
- **Open questions are checkboxes** with a current best guess, not vague worries.
- Documentation obligations are concrete: which file, which section.

For `security` plans, `## Security considerations` is mandatory and must record exposure,
remediation choice, and residual risk.

## 7. Validate

```
python3 <skill-root>/scripts/spec_plan.py validate <NNN>
```

Fix every `ERROR`. For each `WARN`, either fix it or decide consciously not to — a warning
left unresolved must be defensible.

Then self-check the plan against the definition of ready:

- [ ] A different engineer could implement it without asking a design question.
- [ ] Every goal is checkable.
- [ ] Every step names files and a verification.
- [ ] The scope boundary is explicit, including what is out.
- [ ] Dependencies are recorded and their status is known.
- [ ] No code was written and no source file was touched.

## 8. Hand off

Report: plan path, classification, impact, dependencies, validation result, and the single
next command — `spec-implement <NNN>`. Stop there.

## Guardrails

- Write only inside the plan directory. Never touch source, tests, configuration, or other
  documentation while planning.
- Never change a plan's `status` by hand; only `spec_plan.py set-status` may move it.
- Never implement "just the easy part", never prototype code in the plan, and never answer a
  design question with "it depends" left unresolved.
- If the user asks for code during this phase, refuse and point to `spec-implement`.
- If the user asks for a review or a close, refuse and point to `spec-review` / `spec-close`.

## Outputs

- A validated tech plan in `draft` status at `<plan_dir>/NNN-<slug>.md`.
- An optional backlog entry linking the plan, if the repository keeps one.
- A short report ending with `spec-implement <NNN>`.
