---
name: spec-workflow
description: 'Entry point and shared contract of the spec-driven, AI-assisted software lifecycle (spec-plan → spec-implement → spec-review → spec-close). Use when the user asks how the spec/tech-plan workflow works, where a change currently stands, which phase comes next, how to list or resume open tech plans, or how to configure the workflow for a repository (`.spec-workflow.yml`). Also use before invoking a phase skill when the repository conventions (plan directory, status values, quality commands, documentation map) are not yet known. This skill performs no phase itself: it inspects status, resolves conventions, and routes the user to the correct phase skill.'
argument-hint: '[status | show <plan> | configure]'
---

# Spec-Driven Workflow — Shared Contract

Every non-trivial change produced with these skills follows one lifecycle and one
artifact: a **tech plan** whose frontmatter status acts as the quality gate between
phases.

```
   spec-plan            spec-implement            spec-review           spec-close
 ┌───────────┐        ┌───────────────┐        ┌────────────┐        ┌──────────┐
 │ interview │        │ execute steps │        │ verify vs  │        │ version  │
 │ dedupe    │        │ test each step│        │ plan + run │        │ changelog│
 │ write     │        │ track progress│        │ checks     │        │ archive  │
 │ validate  │        │ notes         │        │ verdict    │        │ report   │
 └─────┬─────┘        └───────┬───────┘        └─────┬──────┘        └────┬─────┘
       │ draft                │ in-progress          │ reviewed            │ done
       ▼                      ▼                      ▼                     ▼
     STOP ────────────────► STOP ────────────────► STOP ───────────────► STOP
                                                  │
                                        NEEDS WORK│ back to spec-implement
                                                  └──────► (cyclic until PASS)
```

`spec-auto` collapses the first two STOPs into one invocation — implement every step, then
review — and reports a single verdict. The plan status still moves `draft` → `in-progress` →
`reviewed` through the same gates; only the human gap between them disappears.

## Plan creation is user-authorized only

No tech plan is created on the agent's own initiative. The single authorization is an
explicit user request for `spec-plan`; a defect, a missing test, stale documentation, or
work worth doing is reported, never turned into a plan unprompted. `spec-fast`,
`spec-auto` and `spec-implement-and-review` are invoked explicitly too, and they create only
the record the user asked for.

While a plan is open — `draft`, `in-progress`, or `reviewed` — additional activities the
user requests during implementation are added to that plan: the steps, the files they
touch under *Affected modules*, the matching checklist items, and an entry in
`## Implementation Notes` marked user-approved. A second plan beside an active one is
wrong by construction.

`spec-plan` is the only phase skill that creates a plan, and it creates one only on that
explicit request. After a plan is closed, a follow-up becomes a new plan only when the
user asks for it with `spec-plan` again.

## Artifacts

| Artifact | Owner | Purpose |
|---|---|---|
| Tech plan (`<plan_dir>/NNN-slug.md`) | `spec-plan` | Single source of truth: intent, scope, steps, checklist, notes, verdict |
| Plan directories (`draft/`, `archive/`) | helper script | Status-driven placement, when the repository splits them |
| Quality suite output | `spec-implement`, `spec-review`, `spec-close` | Evidence that a phase really passed |
| `## Implementation Notes` | `spec-implement` | Deviations, discoveries, extra scope |
| `## Review Notes` | `spec-review` | Verdict, gaps, suggested commit message |
| Close report (chat only) | `spec-close` | Version bump, archive location, commit message |

## Package layout

| Path | Role |
|---|---|
| `spec-workflow/` (this skill) | Lifecycle contract, profile discovery, helper script, plan template |
| `spec-plan/` | Phase 1 — create the plan |
| `spec-implement/` | Phase 2 — execute the plan |
| `spec-review/` | Phase 3 — verify, correct stale documentation, verdict, notes |
| `spec-close/` | Phase 4 — version, changelog, archive |
| `spec-fast/` | Fast lane — implement, review, and record a small change retrospectively |
| `spec-auto/` | Chained lane — execute a whole plan and review it in one invocation |
| `spec-implement-and-review/` | Chained lane — close small review findings and re-review in one invocation |

`spec-workflow/` holds the shared assets; the phase skills and the extra lanes reference them
by relative path, so install or copy the whole set together.

The optional `spec-fast <description>` lane implements a small, low-impact change before
writing its retrospective plan. It performs a review, records the evidence in a compatible
plan, and leaves it open for further iterations. Closing still requires a fresh PASS and
the user's explicit `spec-close` request.

The optional `spec-auto <plan>` lane runs a whole plan unattended: `spec-implement` on every
step, then `spec-review`, then the verdict, in one invocation. It exists for machines where
nobody inspects the code between the two phases. It crosses `🔶 CHECKPOINT` blocks instead of
waiting on them, turning any point where `spec-implement` would ask the user into a stop and a
report; it may run one automatic fix round when every `NEEDS WORK` finding is mechanical; and
it never closes the plan. Its review is a self-review in the same session, disclosed as such
in the `## Review Notes` round.

The optional `spec-implement-and-review <plan>` lane is the fix lane: after a `NEEDS WORK`
verdict, it closes the small, mechanical findings and re-runs the review in one invocation, so
the user does not have to shuttle between two phases for a typo. Findings that change
behaviour, need a decision, or that the user wants to inspect first keep the separate
`spec-implement` → `spec-review` path. It never closes the plan.

## Status gates

| Status | Meaning | Allowed next phase | Gate check |
|---|---|---|---|
| `draft` | Plan written and approved, no code yet | `spec-implement` or `spec-auto` | `validate-for implement` |
| `in-progress` | Implementation started, may be incomplete | `spec-implement` (resume), `spec-auto` (resume + review) or `spec-review` | `validate-for review` |
| `reviewed` | Latest review verdict is PASS | `spec-close` | `validate-for close` |
| `done` | Closed and archived | none | — |

`spec-implement` ↔ `spec-review` is a **cycle**. `NEEDS WORK` keeps the plan in
`in-progress`; the user re-runs implementation, then review again. Only the latest
`**Verdict**` in the file counts.

## Non-negotiable rules

1. **One phase per invocation.** A phase skill never starts the next phase. It stops and
   names the exact command for the user to run. Three skills are the explicit exceptions:
   `spec-fast` implements, reviews and records in one invocation; `spec-auto` executes a whole
   plan and reviews it; `spec-implement-and-review` runs the implement and review contracts
   back to back on a fix round. None ever closes automatically, and none relaxes the review
   evidence.
2. **The plan file is the state.** Once the plan exists, never infer progress from chat
   history; read the plan. Progress lives in the checklist, notes sections, and frontmatter.
   `spec-fast` records its first iteration retrospectively.
3. **The user owns transitions.** Only an explicit `spec-fast`, `spec-auto`,
   `spec-implement-and-review` or `spec-close` request authorizes the corresponding run;
   never mark `reviewed` without a review or `done` without a PASS verdict and an explicit
   close request.
4. **No Git writes.** Skills never run `commit`, `push`, `tag`, `merge`, or `rebase` unless
   the profile explicitly sets `git.allow_writes: true`. They only *suggest* a commit
   message.
5. **Status changes go through the helper script**, not through hand-edited frontmatter, so
   the file also moves between `draft/`, the active directory, and `archive/`.
6. **Ask, do not invent.** Unknown plan directory, quality command, version file, or
   ambiguous plan reference → ask the user once, then persist the answer in
   `.spec-workflow.yml` (with permission).
7. **Use only the dedicated plan helper for plan operations it supports.** Run the
   corresponding `spec-plan.mjs` command for plan lookup, status, checklist, validation,
   numbering, and archive operations. Never substitute an improvised shell command
   or manually reproduce a helper check. If the helper is unavailable or cannot perform
   the required operation, stop and report the blocker.
8. **Plans are created only on request.** A plan file is written only by `spec-plan`, and
   only when the user explicitly asks for it. Additional work requested while a plan is
   open joins that plan; it never justifies a second plan.

## Helper script

`scripts/spec-plan.mjs` ships with this skill. It is dependency-free Node.js 22+ and reads
the profile from the repository root discovered from the current working directory:

```
aispec plan config
```

The script imports the shared helpers from `lib/` at the skills repository root, so
every skill directory must stay next to `lib/`; do not copy a skill directory on its own.

| Command | Purpose |
|---|---|
| `next-number` | Next free plan number, zero-padded per profile |
| `list [--status S]` | Open plans with status, type, impact, checklist progress |
| `show REF` | Frontmatter summary, checklist progress, latest verdict, note counts |
| `checklist REF` | Every unticked item with `file:line`; exit 2 if incomplete |
| `validate REF [--strict]` | Frontmatter + required sections; `--strict` also requires a full checklist |
| `validate-for implement\|review\|close REF` | Status gate (+ dependency and verdict checks) |
| `set-status REF STATUS` | Update status and move the file between plan directories |
| `archive REF` | Move a `done` plan to the archive directory |

Resolve `<skill-root>` from this skill's location (for a user-scope install it is
`~/.copilot/skills/spec-workflow`). If the script is unavailable or cannot perform a
required operation, stop and report the blocker; do not reproduce its checks manually.

## Project profile

Conventions are discovered, never assumed. Discovery order:

1. `.spec-workflow.yml` or `.spec-workflow.yaml` at the repository root.
2. Existing layout sniffing: `tech-plans/`, `docs/tech-plans/`, `docs/specs/`, `specs/`,
   `plans/`, `docs/plans/`; optional `draft/` and `archive/` subfolders.
3. Ask the user, then offer to write the profile.

Full schema, key semantics, quality-command discovery, and stack presets:
[references/project-profile.md](./references/project-profile.md).

The canonical plan format lives in
[assets/tech-plan-template.md](./assets/tech-plan-template.md) and is enforced by
`validate` for the required frontmatter fields and body sections.

## Operating this skill

### Report status

1. Run `spec-plan.mjs list`. If the user named a plan, run `show <ref>` and `checklist <ref>`.
2. Map each plan to its next command:

| Status | Next command |
|---|---|
| `draft` | `spec-implement <NNN>`, or `spec-auto <NNN>` to execute and review unattended |
| `in-progress`, no review yet | `spec-implement <NNN>` (resume), or `spec-auto <NNN>` to finish and review |
| `in-progress`, latest verdict `NEEDS WORK` | `spec-implement <NNN>` |
| `reviewed` | `spec-close <NNN>` |
| `done` | nothing — already archived |

For an `in-progress` plan whose latest verdict is `NEEDS WORK` with only small, mechanical
findings, `spec-implement-and-review <NNN>` is the shorter equivalent of the two-phase
sequence; anything else stays with `spec-implement`. On an unattended machine, `spec-auto
<NNN>` is the equivalent of `spec-implement` + `spec-review` for a plan that has not been
reviewed yet.

### Resume a change

Read the plan in full, then report: status, checklist progress, last implementation note,
latest verdict, and the single next action. Do not start that action unless the user asks.

### Configure a repository

Inspect the layout and build tooling, propose a `.spec-workflow.yml` that matches what
already exists (never move existing plans), show it for confirmation, and write it only
after approval.

## Routing

| User intent | Skill |
|---|---|
| Implement and review a small change, then record it retrospectively | `spec-fast` |
| Execute a whole plan and review it in one unattended invocation | `spec-auto` |
| Close small, mechanical review findings and re-review in one pass | `spec-implement-and-review` |
| Plan a feature, fix, refactor, or CVE/security remediation — only when the user explicitly asks for `spec-plan` | `spec-plan` |
| Execute an approved plan | `spec-implement` |
| Review a completed implementation | `spec-review` |
| Close, version-bump, and archive a reviewed plan | `spec-close` |

## When to refuse

- The requested phase does not match the plan status → report the gate failure and the
  command that is actually allowed.
- The user asks the workflow to skip review or to mark work done without evidence → refuse
  and explain the gate.
- The plan is missing or ambiguous → ask for `NNN`, `NNN-slug`, or a path.
- The user did not explicitly ask for a plan, or an open plan already carries the work →
  report the finding or extend the open plan instead; never create a plan unprompted.
