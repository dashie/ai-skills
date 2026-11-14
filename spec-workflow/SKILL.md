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
| `spec-review/` | Phase 3 — verify, verdict, notes |
| `spec-close/` | Phase 4 — version, changelog, archive |

`spec-workflow/` holds the shared assets; the four phase skills reference them by relative
path, so install or copy the whole set together.

## Status gates

| Status | Meaning | Allowed next phase | Gate check |
|---|---|---|---|
| `draft` | Plan written and approved, no code yet | `spec-implement` | `validate-for implement` |
| `in-progress` | Implementation started, may be incomplete | `spec-implement` (resume) or `spec-review` | `validate-for review` |
| `reviewed` | Latest review verdict is PASS | `spec-close` | `validate-for close` |
| `done` | Closed and archived | none | — |

`spec-implement` ↔ `spec-review` is a **cycle**. `NEEDS WORK` keeps the plan in
`in-progress`; the user re-runs implementation, then review again. Only the latest
`**Verdict**` in the file counts.

## Non-negotiable rules

1. **One phase per invocation.** A phase skill never starts the next phase. It stops and
   names the exact command for the user to run.
2. **The plan file is the state.** Never infer progress from chat history; read the plan.
   Progress lives in the checklist, notes sections, and frontmatter.
3. **The user owns transitions.** Never auto-chain phases, never mark `reviewed` without a
   review, never mark `done` without a PASS verdict.
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

## Helper script

`scripts/spec-plan.mjs` ships with this skill. It is dependency-free Node.js 22+ and reads
the profile from the repository root discovered from the current working directory:

```
node <skill-root>/scripts/spec-plan.mjs config
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
| `draft` | `spec-implement <NNN>` |
| `in-progress`, no review yet or latest verdict `NEEDS WORK` | `spec-implement <NNN>` |
| `reviewed` | `spec-close <NNN>` |
| `done` | nothing — already archived |

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
| Plan a feature, fix, refactor, or CVE/security remediation | `spec-plan` |
| Execute an approved plan | `spec-implement` |
| Review a completed implementation | `spec-review` |
| Close, version-bump, and archive a reviewed plan | `spec-close` |

## When to refuse

- The requested phase does not match the plan status → report the gate failure and the
  command that is actually allowed.
- The user asks the workflow to skip review or to mark work done without evidence → refuse
  and explain the gate.
- The plan is missing or ambiguous → ask for `NNN`, `NNN-slug`, or a path.
