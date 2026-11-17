---
name: spec-plan
description: 'Create a tech plan — the spec document that must exist before any code is written — for a feature, bug fix, refactor, performance, documentation, test, or CVE/security remediation. Use when the user asks to plan a change, says "spec-plan", "piano tecnico", "tech plan", "progetta questa feature", "fammi un piano", wants an implementation plan for an issue, or wants to assess a CVE / dependency vulnerability and decide the remediation strategy. Interviews the user, checks for duplicate plans and dependencies, assesses scope, writes and validates the plan file, and stops before implementation. It never writes or reviews code, and it never creates a plan unless the user explicitly asks for one with spec-plan.'
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

## Invocation rule

You run only when the user explicitly asks for a plan with `spec-plan`. Never create,
draft, or propose a plan on your own initiative — not after reading code, not after
finding a defect, a missing test, or stale documentation. Report the finding instead and
let the user decide.

If a plan is already open, do not create a second one on your own. Additional work the user
asks for joins the open plan through `spec-implement`. The only exceptions are an explicit
user decision to open a new plan, and a split the user approved in §4.

## 0. Resolve the project profile

Read `.spec-workflow.yml` (repo root) if it exists; otherwise infer from the layout
(`tech-plans/`, `docs/specs/`, `specs/`, `plans/`, `draft/`, `archive/`) and ask only for
what remains unknown. Schema and presets:
[../spec-workflow/references/project-profile.md](../spec-workflow/references/project-profile.md).

Then read the canonical plan format:
[../spec-workflow/assets/tech-plan-template.md](../spec-workflow/assets/tech-plan-template.md).

Get the next number with the helper script:

```
aispec plan next-number
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
cases and failure paths, integration points, impact, how the change will be verified, and —
whenever the change is visible to users — what they do differently and which configuration
options they gain, lose, or see change.

## 3. Duplicate and dependency check

1. `spec-plan.mjs list --status all` — read titles and types.
2. If an open plan covers the same change, or the request arrived while that plan is being
   implemented, show it and offer to extend it — the normal outcome — or to supersede it or
   cancel the new request. Extending happens in `spec-implement`, not in a new file.
   **Never create a duplicate or a second parallel plan without that explicit user decision.**
3. If an existing open plan is a prerequisite, record its number in `depends_on`. A
   dependency must reach `done` before this plan can be implemented.
4. If a plan conflicts with this change (same files, opposite intent), surface the conflict
   before writing anything.

## 4. Assess scope

For `medium`/`high` impact, decide explicitly between one plan and a split:

- **Split** when there are natural stable increments (model before wiring, backend before
  UI, core before optimisation). Propose 2–4 plans with titles, one-line scope, and
  dependency order; create them as separate files only after the user explicitly agrees (the approved split is
  the one case where several plans are drafted in one run; dependencies go in `depends_on`).
- **Single plan with checkpoints** when the work must ship together but has risky
  integration points. Insert checkpoint blocks (template in the plan format) and set
  `branch_recommended: true`.

Checkpoints are a contract: the implementer stops there and waits. Use them sparingly, and
only when a human decision really is required at that point: `spec-auto` crosses them and
reports them afterwards, so a plan meant for unattended execution gains nothing from them.

## 5. Gather context

Before writing: read the affected source files, their tests, the configuration they consume,
and the docs the plan will have to update (architecture, decision records, glossary,
product, user guide, developer guide, changelog, backlog). Cite the concrete symbols and
files you found; a plan that names real functions is executable.

### The user guide is part of every user-visible plan

`docs/USER-GUIDE.md` is the end-user document: a three-line product summary, how to use the
product, and **every configuration option** with its type, default, accepted values, and
effect. It is distributed on its own, so it is self-contained and never links to the
repository's internal documents.

When the change alters what a user does, sees, or configures — a new or changed command,
flag, endpoint, screen, default, environment variable, or configuration key — the plan
**must**:

1. list `docs/USER-GUIDE.md` under **Documentation / configuration** in *Affected
   modules*, naming the sections to update (`What it is`, `How to use it`,
   `Configuration`);
2. add a step in *Proposed solution* that updates it, with a `Verify:` line that checks the
   documented option against the code that reads it;
3. keep the summary at three lines or less — detail belongs in the sections below it.

A plan that changes user-visible behaviour or a configuration option without that entry is
incomplete: review treats the missing guide update as a defect.

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
- **Configuration changes carry their excerpt.** Whenever the plan adds, removes, renames,
  or changes a configuration parameter (key, environment variable, CLI flag, YAML/JSON/TOML
  entry, or default), the affected step **must** include a short excerpt of the real
  configuration file showing that parameter in its surrounding context — before/after when
  the value already exists. A snippet of the relevant block is enough; never paste a whole
  configuration file, and never describe the parameter only in prose.
- **Verification plan names the exact quality command** from the project profile.
- **Implementation checklist mirrors the steps** and ends with the mandatory items (open
  questions resolved, quality suite passes, docs updated, Implementation Notes written).
- **Open questions are checkboxes** with a current best guess, not vague worries.
- Documentation obligations are concrete: which file, which section — and the user guide
  entry described above whenever the change is user-visible or touches configuration.

For `security` plans, `## Security considerations` is mandatory and must record exposure,
remediation choice, and residual risk.

## 7. Validate

```
aispec plan validate <NNN>
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

Report: plan path, classification, impact, dependencies, validation result, and the next
command — `spec-implement <NNN>`, or `spec-auto <NNN>` when the plan is meant to run
unattended through the review. Stop there.

## Guardrails

- Use `spec-plan.mjs` for every supported plan operation, including numbering, lookup,
  duplicate checks, validation, and status changes. Do not invent ad-hoc shell commands or
  manually reproduce a helper check; if the helper is unavailable or lacks the required
  operation, stop and report the blocker.
- Never create a plan unless the user explicitly asked for one with `spec-plan`, and never
  create a second plan beside an open one unless the user chose that or approved a split
  (§4): additional work otherwise joins the active plan.
- Write only inside the plan directory. The single exception is one line in the configured
  `docs.backlog`, linking the plan filename next to its item (`spec-close` marks it
  delivered). Never touch source, tests, configuration, or other documentation.
- Never change a plan's `status` by hand; only `spec-plan.mjs set-status` may move it.
- Never implement "just the easy part", never prototype code in the plan, and never answer a
  design question with "it depends" left unresolved.
- If the user asks for code during this phase, refuse and point to `spec-implement`.
- If the user asks for a review or a close, refuse and point to `spec-review` / `spec-close`.

## Outputs

- A validated tech plan in `draft` status at `<plan_dir>/NNN-<slug>.md`.
- When `docs.backlog` is configured and holds a matching item, that item links the plan.
- A short report ending with `spec-implement <NNN>` or `spec-auto <NNN>`.
