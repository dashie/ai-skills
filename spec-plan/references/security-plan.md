# Security and CVE Plans

A `security` plan exists to turn an advisory or a scanner finding into an evidence-backed
decision. The output is not "upgrade the dependency": it is a documented statement of
**exposure**, **chosen remediation**, **verification**, and **residual risk**.

## Inputs to collect first

| Item | Why it matters |
|---|---|
| Advisory id (`CVE-…`, `GHSA-…`, `RUSTSEC-…`, distro id) | Traceability in the plan and the changelog |
| Package, ecosystem, affected version range | Decides upgrade vs override |
| Severity and CVSS vector | Prioritisation, but not the whole decision |
| Exploitability preconditions | Network reachability, auth, config |
| Fixed version / upstream patch commit | The remediation target |
| Scanner that reported it and its config | Reproducibility of the finding |

Record the raw facts in the plan. Never paraphrase a severity without the identifier.

## Triage before planning remediation

1. **Presence**: is the package installed (direct or transitive), in which lockfiles, for
   which targets (runtime, dev, build, test)? A dev-only transitive dependency is not the
   same risk as a runtime one.
2. **Reachability**: does this product call the vulnerable code path? Check imports, entry
   points, server surfaces, and configuration. Absent reachability, say so with evidence.
3. **Exposure**: who can trigger it — anonymous network, authenticated user, local operator,
   build pipeline? Combine with deployment configuration.
4. **Compensating controls**: input validation, sandboxing, network policy, disabled feature,
   WAF rule. Controls reduce risk; they do not remove the finding.
5. **Time pressure**: known exploitation in the wild, public PoC, regulatory obligation.

Only after these five does the remediation choice make sense.

## Remediation options

| Option | Use when | Cost |
|---|---|---|
| Upgrade the direct dependency | Affected range has a fixed release | API breaks, lockfile churn |
| Override/resolve a transitive version | Transitive only, parent is compatible | Hidden incompatibility |
| Vendor/backport the patch | No fixed release, upstream patch exists | Maintenance debt, fork |
| Configuration or code mitigation | Exploit path can be closed locally | May be partial |
| Documented acceptance | Not reachable, or cost outweighs risk | Requires owner and review date |

Never choose "accept" without an explicit owner and a review date recorded in the plan.

## Verification requirements

- **Reproduce the finding first** with the project's scanner (`npm audit`,
  `pip-audit`/`uv pip audit`, `osv-scanner`, `govulncheck`, `cargo audit`,
  `bundle audit`, `mvn dependency-check`, or the profile's `security` command). A finding you
  cannot reproduce cannot be verified as fixed.
- **Re-run the same command** after the change and paste the result in the plan's notes.
- **Prove behaviour** if code changed: a regression test that fails before and passes after.
- **Check the lockfile and CI** — the fixed version must be the one actually resolved and
  gated in CI, not just declared in a manifest.
- **Check the runtime artefacts**: container base images, bundled binaries, vendored copies,
  Electron/desktop runtimes, and any second lockfile the build uses.

## Plan skeleton for a CVE

```markdown
---
title: Remediate CVE-XXXX-YYYYY in <package>
date: YYYY-MM-DD
status: draft
type: security
impact: high
area: dependencies
version_bump: patch
tags: [security, cve]
depends_on: []
---

## Summary
<advisory id, package, affected range, chosen remediation, expected outcome>

## Why
<severity, exploitation status, exposure in this product, consequence of inaction>

## Goals
- Advisory no longer reported by <scanner command>
- Resolution evidence: <package> resolved at <fixed version>
- No behaviour regression: full quality suite green
- Decision and residual risk recorded in the plan

## Affected modules
- `<manifest>` — dependency declaration
- `<lockfile>` — resolved version
- `tests/...` — regression test when code changes
- `CHANGELOG.md` — security entry

## Security considerations
- Applicability: <reachable / not reachable, with the evidence>
- Exposure: <who can trigger, under which configuration>
- Remediation: <option chosen and why>
- Residual risk: <remaining risk, owner, review date>

## Proposed solution
### Step 1 — Reproduce
**Verify:** <scanner command output showing the finding>

### Step 2 — Apply remediation
**Verify:** <manifest/lockfile diff showing the fixed version>

### Step 3 — Prove no regression
**Verify:** <full quality suite>

### Step 4 — Re-scan
**Verify:** <same scanner command, finding gone>

## Verification plan
- Automated: scanner, quality suite, regression test
- Manual: smoke test of the affected feature
- Rollback: revert the pin/upgrade, restore the previous lockfile

## Implementation checklist
- [ ] Finding reproduced and recorded
- [ ] Remediation applied and resolved version verified
- [ ] Regression test added (if code changed)
- [ ] Scanner re-run clean
- [ ] Quality suite passes
- [ ] Changelog security entry added
- [ ] Residual risk and owner recorded
- [x] All open questions resolved
- [ ] `## Implementation Notes` added or updated in this plan
```

## Special cases

- **Not affected / not reachable.** The plan is still valid with `version_bump: none`: its
  step is to record the assessment, add a guard (CI scanner gate, comment in the manifest),
  and link the advisory. Implementation is documentation plus, optionally, a test asserting
  the invariant that makes it unreachable.
- **Many findings, one advisory batch.** One plan may cover a batch when remediation is the
  same upgrade; list every identifier in `tags`/Summary and keep one verify step per scanner
  run.
- **Breaking major upgrade.** Split: one plan for the security fix with the smallest safe
  surface, a separate `refactor` plan for the follow-up modernisation. Do not hide a large
  refactor inside a security plan.
- **No fixed version available.** Choose backport or mitigation, state the monitoring plan,
  and set a review date; never leave "wait for upstream" without an owner.
