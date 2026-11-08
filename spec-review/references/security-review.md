# Reviewing Security and CVE Plans

A `security` plan is reviewed on evidence, not intent. The generic matrix applies; these are
the additional checks and the red flags that must block a PASS.

## Required checks

| # | Check | Evidence |
|---|---|---|
| 1 | The advisory/finding is identified exactly (id, package, range) | plan text matches the advisory |
| 2 | Exposure assessment is present and justified | reachability argument, not a guess |
| 3 | Remediation choice is stated and consistent with the code | manifest/lockfile diff |
| 4 | The resolved version is the fixed one, everywhere it is installed | `npm ls <pkg>`, `pip show`/lockfile, `go list -m`, `cargo tree`, container image layers |
| 5 | The scanner is re-run with the same command and the finding is gone | pasted output |
| 6 | No other scanner finding was introduced | full scan diff |
| 7 | CI actually gates the fixed version | CI config or lockfile committed |
| 8 | Regression test exists when code changed | test fails on the pre-fix commit |
| 9 | Residual risk, owner, and review date are recorded | plan `## Security considerations` |
| 10 | Changelog has a security entry at close | changelog diff, or recorded as a close task |

## Verification commands per ecosystem

Run what the project already uses; never introduce a scanner as part of the review.

| Ecosystem | Typical commands |
|---|---|
| Node | `npm audit --json`, `pnpm audit`, `yarn npm audit` |
| Python | `pip-audit`, `uv pip audit`, `safety check` |
| Go | `govulncheck ./...` |
| Rust | `cargo audit` |
| Ruby | `bundle audit check --update` |
| Java | `mvn dependency-check:check`, OWASP dependency-check Gradle task |
| Multi / OS-level | `osv-scanner --recursive .`, `trivy fs .`, `grype` |
| Containers | `trivy image <tag>`, `docker scout cves <tag>` |

## Red flags — always a blocker

- Version bumped in the manifest but the lockfile still resolves the vulnerable version.
- A second lockfile, vendored copy, container base image, or bundled runtime still vulnerable.
- The advisory's vulnerable function is reachable and the plan claims "not affected" without
  an argument.
- "Accepted risk" with no owner or no review date.
- Tests deleted, skipped, or narrowed to make the suite green after the upgrade.
- A dependency replaced by a fork with no provenance, checksum, or maintenance note.
- Secrets, tokens, or internal hostnames introduced in the diff while fixing the finding.
- A major upgrade smuggled into a `security` plan, hiding unrelated breakage.

## Reviewing an "accept / not affected" outcome

The plan may legitimately conclude that no change is needed. Then verify:

1. The reachability argument names the entry points checked and why the vulnerable path is
   unreachable.
2. A guard exists so the conclusion does not silently rot: CI scanner gate, manifest comment
   with the advisory id, or a test asserting the invariant.
3. The decision is recorded where future maintainers look (plan, plus the security policy or
   changelog if one exists).
4. The review date or trigger for re-assessment is set.

Missing any of these makes the outcome `NEEDS WORK`, because an unrecorded acceptance is
indistinguishable from an unnoticed vulnerability.
