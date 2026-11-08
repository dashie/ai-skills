# Interview Guide

The interview turns a vague request into a plan with no open design branches. It is
codebase-first and batched: every question you still need to ask has already been checked
against the repository.

## Procedure

1. **Enumerate** the decisions the change requires, branch by branch: what exists, what
   changes, what could break, how it is proven.
2. **Resolve from evidence.** Search code, tests, docs, configuration, schema, CI, and issue
   tracker. If the repository answers a question, write the answer into the plan and move
   on.
3. **Batch the rest.** One `ask_user` call with several questions beats five round trips.
   Mark the recommended option as the default so acceptance is one click.
4. **Close branches.** After each batch, restate what was decided and either ask the next
   batch or declare the interview complete.
5. **Complete means**: no question remains whose answer would change the files touched, the
   steps, or the verification.

## Question format

| Answer space | Form |
|---|---|
| Bounded choice (strategy, yes/no, enum) | options with a recommended default |
| Multiple legitimate answers | multi-select |
| Genuinely open (name, threshold, prose) | free text |

Never ask "what do you want?" in prose when the codebase already implies an answer.

## Catalogue by intervention type

### All types

- **Observable success**: what must be true for a user/operator/test for this to be done?
- **Scope boundary**: which modules are definitely in, which are explicitly out?
- **Impact**: low (local, reversible), medium (cross-module, needs review), high
  (schema/API/architecture/user data).
- **Compatibility**: must existing data, APIs, configs, and clients keep working?
- **Failure behaviour**: what happens on invalid input, partial failure, timeout, retry?
- **Verification**: which existing command proves the change, and which new test pins it?
- **Documentation**: which living document must change in the same commit?
- **Rollout**: feature flag, migration, backfill, or immediate switch?

### `feature`

- Who uses it and through which entry point (CLI, HTTP, UI, library)?
- Default behaviour when the feature is not configured — enabled or off?
- Is the data contract (schema, payload, file format) new or an extension of an existing one?
- Is a migration required for existing data, and is it reversible?
- Which existing entities/endpoints/tests are affected by the new path?

### `fix`

- Exact reproduction: input, environment, steps, observed vs expected.
- Root cause hypothesis, and how it will be confirmed before the fix is written.
- Is the defect already pinned by a failing test? If not, the first step is that test.
- Blast radius: are other call sites affected by the same cause?
- Regression guard: which test prevents this class of defect from returning?

### `refactor`

- What is the measurable problem (duplication, coupling, build time, cyclomatic load)?
- Hard constraint: behaviour must not change — which test suite proves it?
- Public surface that must stay stable (imports, signatures, CLI flags, file formats)?
- Staged or single-step, and what is the rollback point?

### `perf`

- Baseline number and measurement method (command, dataset, environment).
- Target number and acceptable regression threshold.
- Profiling evidence for the bottleneck, not a guess.
- Complexity/space trade-off accepted, and what is deliberately not optimised.

### `docs` / `test`

- Which reader or behaviour is currently unserved?
- Source of truth for the content (code, schema, decision record).
- How a stale document or a hollow test will be detected later?

### `security` / CVE

See [security-plan.md](./security-plan.md). Always additionally ask:

- Is the vulnerable code path reachable in this product, and under which configuration?
- Who accepts the residual risk if remediation is deferred or partial?

## Anti-patterns

- Asking the user what the code already states.
- Asking one question per message.
- Accepting "make it better/faster/cleaner" as a goal.
- Leaving an open question without a best guess and an owner.
- Interviewing beyond the decision tree — stop when the branches are resolved.
