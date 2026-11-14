# Review Evidence and Reporting

The review phase stands or falls on evidence. This reference defines what counts as proof,
which documents a given change obliges you to update, and how to write the notes block.

## Evidence rules

| Claim | Acceptable evidence | Not acceptable |
|---|---|---|
| Tests pass | Command + summary line (`142 passed`) | "tests look fine" |
| Linter clean | Command + exit status | "no obvious issues" |
| Types clean | Command + error count | "types seem right" |
| Goal achieved | Test, command output, or inspected behaviour | Reading the diff and nodding |
| Behaviour preserved | Existing suite green, no test weakened | "should still work" |
| Docs updated | Diff hunk in the document | Doc exists somewhere |

Run the whole quality suite, not the narrow selection the implementer used. If a category is
not configured in the profile, write `n/a — not configured` and say which command you asked
about.

## Documentation obligations

Map each change to what it obliges. Only audit paths that exist in the repository; a missing
path is not a finding, a stale existing path is.

| Change | Document to verify |
|---|---|
| New/moved/removed module, layer, or data flow | architecture document |
| New trade-off, technology, or reversal of a decision | decision record |
| New/renamed domain term | glossary |
| User-visible behaviour, scope, business rule | product document |
| User-visible behaviour, usage step, or configuration option | user guide (usage plus every option, default, and accepted values; self-contained) |
| Build, run, test, or contribution steps | developer guide, README |
| New/renamed/removed configuration field | configuration reference **and** example config |
| New/changed/removed endpoint, event, or CLI flag | API reference, CLI docs, **and** the user guide (how to use it) |
| Any user-visible change | changelog (at close, if the project ships one) |
| Any new dependency or bump | lockfile, dependency policy notes |

A change that touches one of these areas with no corresponding document update is a **major**
finding, unless the plan explicitly justified why no update is needed.

## Scope computation

1. Diff file list: `git diff --name-only <base>...HEAD` plus untracked files.
2. Extract the plan's `## Affected modules` file paths (strip backticks, drop `(maybe)`).
3. Classify each diff file: `listed`, `listed (maybe)`, `not listed`.
4. `not listed` files are out-of-scope **unless** the `## Implementation Notes` records
   explicit approval. Renamed/moved files count as listed if the plan named either path.
5. Generated artefacts (lockfiles, generated API docs, build output) count as in-scope when
   the plan or the project's conventions produce them; say so explicitly.

## Test review

- New behaviour has a test that would fail without the change — read the assertions, not just
  the test name.
- No new `skip`, `xfail`, `todo`, disabled case, or widened assertion in existing tests.
- No test-only hooks leaking into production code.
- Coverage of the failure paths the plan described (invalid input, empty result, timeout).
- A `security` plan's regression test must pin the vulnerable behaviour, not merely the
  upgrade.

## Commit message derivation

```text
<type>(<scope>): <imperative lowercase description ≤72 chars>
```

| Plan `type` | Commit type |
|---|---|
| `feature` | `feat` |
| `fix` | `fix` |
| `security` | `fix` (code/dependency remediation) or `chore` (pin-only) |
| `refactor` | `refactor` |
| `perf` | `perf` |
| `docs` | `docs` |
| `test` | `test` |
| `chore` | `chore` |

`scope` is the plan's `area`, slugified: lowercase, non-alphanumerics collapsed to `-`, first
meaningful segment only. The description states the outcome, not the activity ("avoid
null deref in tile loader", not "fix stuff").

If the profile sets `commit_convention: free`, omit the convention and write a plain sentence.

## Review Notes example

```markdown
## Review Notes

- **Round**: 2
- **Review date**: 2026-03-14
- **Verdict**: PASS
- **Suggested commit**: `fix(loader): reject empty tile payloads`
- **Quality gate**: tests ✓ (312 passed) | lint ✓ (0) | types ✓ (0) — `npm run check`

### Findings
| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | major | `src/tile/loader.ts` | Empty payload silently produced a zero-size tile | fixed in round 2 |
| 2 | minor | `docs/configuration.md` | New field documented without default value | fixed 2026-03-14 |

### Gap analysis
- Goals: 4/4 achieved
- Scope: in scope (2 files, both listed)
- Deviations: validation added in `loader.ts` instead of the caller — safer, documented in Implementation Notes
- Additions: 2 extra unit tests for the empty-payload branch
- Deferred: none

### Known limitations
- Payloads above 64 MiB are still rejected by the transport layer, not by this validator.

### Recommendations for future work
- Add a property-based test for tile payload round-tripping.
```

## Escalation triggers

Stop reviewing and hand the decision to the user when:

- the quality suite fails for reasons unrelated to this plan and the baseline was already red;
- the same finding has survived two rounds;
- the implementation reveals the plan's premise is wrong (an API does not exist, the data
  model cannot hold the feature);
- the scope needs to grow beyond what the user approved;
- the change set cannot be separated from unrelated work in the working tree.
