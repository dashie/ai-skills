---
title: <Imperative, specific title — what changes, not "improvements">
date: <YYYY-MM-DD>
status: draft
type: <feature | fix | refactor | perf | docs | test | security>
impact: <low | medium | high>
area: <module, subsystem, or area affected>
version_bump: <patch | minor | major | none>
tags: []
depends_on: []
branch_recommended: false
---

<!--
Template notes (delete this block when the plan is written):

- Frontmatter fields `title`, `date`, `status`, `type`, `impact`, and `area` are required
  by `spec_plan.py validate`. Keep `status: draft` when creating the plan; only
  `spec_plan.py set-status` may change it.
- Required body sections: Summary, Why, Goals, Affected modules, Proposed solution,
  Implementation checklist. Keep the exact heading text.
- Goals use plain `- ` bullets. Checkboxes `- [ ]` belong to Open questions and the
  Implementation checklist only.
-->

## Summary

One paragraph: what will change, for whom, and what stays the same. A reader should be able
to decide whether this plan is worth reading in 20 seconds.

## Why

The problem, the evidence that it is real (test failure, user report, benchmark, CVE
advisory, support ticket), and the cost of leaving it unfixed.

## Goals

- Concrete, verifiable outcome (observable behaviour, not activity).
- Another outcome, each one checkable by a test, a command, or an inspection.
- Preserve existing behaviour where the change must not be visible to users.

## Non-goals

- Explicitly out of scope, so the implementer does not drift.
- Adjacent problems deliberately deferred (name them; do not hide them).

## Dependencies

<!-- Required only when depends_on is non-empty. One row per dependency. -->

| Plan | Title | Status |
|---|---|---|
| `007` | <dependency title> | <draft \| in-progress \| reviewed \| done> |

## Affected modules

Every file the implementation is expected to touch, grouped by category. This list is the
**scope boundary**: anything outside it requires explicit user permission.

**Source**
- `path/to/module.ext` — what changes and why

**Tests**
- `tests/path/test_module.ext` — *(new)* which behaviour it covers

**Documentation / configuration**
- `docs/ARCHITECTURE.md` — section to update (or "no change")
- `docs/USER-GUIDE.md` — sections to update when the change is user-visible or touches a
  configuration option (`What it is`, `How to use it`, `Configuration`); the guide is
  self-contained and lists every option

Mark uncertain files with `(maybe)`; they also require confirmation before editing.

## Architecture impact

State the architectural consequence and, if the repository keeps an architecture document,
which sections must be updated. Otherwise write "No architectural change: <one-line
justification>".

## Decision-record impact

State whether a new or amended decision record is required and why. Otherwise write "No new
decision record: <one-line justification>". A new trade-off, technology, or reversal of an
earlier decision requires one.

## Proposed solution

Numbered steps, each independently verifiable. For every step name the files involved, the
observable result, and how it will be checked.

### Step 1 — <verb> <object>

<What changes, in which files, and why this order.>

**Verify:** <exact command or inspection that proves the step worked>

### Step 2 — <verb> <object>

<…>

### Checkpoint template (use only when the plan is split into phases)

> **🔶 CHECKPOINT CP-1 — <short label>**
> **Stable state:** <what works and is safe to leave in place>
> **Verify:** <commands to run>
>
> The implementer must stop here, report, and wait for explicit user confirmation.

## Security considerations

<!-- Mandatory for type: security. Optional otherwise; keep it when the change touches
     authentication, authorization, secrets, untrusted input, dependencies, or the
     supply chain. -->

- Applicability and exposure: <is the vulnerable code path reachable, with what input>
- Remediation choice: <upgrade | override/pin | patch | mitigation | documented acceptance>
- Residual risk and who accepted it

## Verification plan

- **Automated:** tests to add or extend, with the behaviour each one pins down.
- **Quality gate:** the exact command(s) that must pass, from the project profile.
- **Manual:** steps a human runs when automation cannot cover the behaviour.
- **Rollback:** how to revert cleanly if the change misbehaves.

## Open questions

- [ ] <Question that must be answered before or during implementation, with the current
      best guess and who can answer it>

## Implementation checklist

One item per step, in order. Tick items as they are completed — this is the live progress
log used to resume a session.

- [ ] Step 1 — <short label>
- [ ] Step 2 — <short label>
- [x] All open questions resolved
- [ ] Quality suite passes (`<command from the profile>`)
- [ ] Documentation listed under Affected modules is updated
- [ ] User guide (`docs/USER-GUIDE.md`) reflects user-visible behaviour and every
      configuration option, or the plan records why it needs no change
- [ ] `## Implementation Notes` added or updated in this plan
