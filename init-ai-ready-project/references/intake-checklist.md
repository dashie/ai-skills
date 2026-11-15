# Intake Checklist

Fields needed to produce meaningful documents. Ask with the `ask_user` tool, batched
by group, ordered as below. `must-have` fields block the run when unanswered; when the
user declines, write the gap down as an assumption instead of inventing a fact.

## Group 1 — Identity (must-have)

| Field | Question | Why |
|---|---|---|
| `PROJECT_NAME` | What is the project called? | Titles, headings, package names |
| `TAGLINE` | One sentence: what does it do, for whom? | `README.md` opening line |
| `PROJECT_PURPOSE` | What is this repository for? (2–4 sentences) | `AGENTS.md`, agent orientation |

## Group 2 — Product (must-have)

| Field | Question | Why |
|---|---|---|
| `PROBLEM_STATEMENT` | Which problem does it solve, and how is it solved today? | `docs/PRODUCT.md` motivation |
| `TARGET_USERS` | Who are the primary users/personas? | Scope and behaviour decisions |
| `SCOPE_IN` | What is in scope for the first usable version? | Prevents scope drift |
| `FUNCTIONAL_REQUIREMENTS` | What must the product do? (numbered, testable) | Core behaviour contract |
| `USAGE_GUIDE` | How does a user install, start, and use it? Walk me through the main flow. | `docs/USER-GUIDE.md` |
| `CONFIGURATION` | Which settings can a user change — name, default, accepted values? | `docs/USER-GUIDE.md`, complete option list |

## Group 3 — Product (nice-to-have)

| Field | Question | Default if unanswered |
|---|---|---|
| `VALUE_PROPOSITION` | Why choose this over the alternatives? | Derived from problem + users |
| `SCOPE_OUT` | What is explicitly out of scope? | "Not decided yet" |
| `BUSINESS_RULES` | Which rules must always hold for the domain? | Derived from requirements |
| `NON_FUNCTIONAL_REQUIREMENTS` | Performance, availability, security, privacy constraints? | Stated as open questions |
| `SUCCESS_METRICS` | How do we know it works in production? | Stated as open questions |
| `PRODUCT_SUMMARY` | The three-line answer to "what is this, for whom?" | Derived from `TAGLINE` and `PROBLEM_STATEMENT` |

## Group 4 — Architecture (must-have)

| Field | Question | Why |
|---|---|---|
| `TECH_STACK` | Languages, frameworks, runtime versions, storage, deployment target? | `docs/ARCHITECTURE.md`, `docs/DEVELOPER-GUIDE.md` |
| `COMPONENTS` | Main components/services and their responsibilities? | C4 containers/components (PlantUML) |
| `INVARIANTS` | Which properties must never break? | Architecture guardrails |

## Group 5 — Architecture (nice-to-have)

| Field | Question | Default if unanswered |
|---|---|---|
| `COMPONENT_CONTRACTS` | Interfaces/APIs/events between components? | Inferred from responsibilities |
| `DATA_MODEL` | Entities, ownership, persistence rules? | Inferred, marked as draft |
| `DEPLOYMENT_VIEW` | Environments, CI/CD, hosting? | "To be defined" |
| `ARCHITECTURE_ASSUMPTIONS` | Known technical risks or constraints? | "None recorded yet" |

## Group 6 — Delivery (must-have)

| Field | Question | Why |
|---|---|---|
| `PREREQUISITES` | Toolchain the contributor must install (with versions)? | Setup instructions |
| `BUILD_RUN_TEST_COMMANDS` | Commands to install, build, run, test, lint? | Developer guide |

## Group 7 — Delivery (nice-to-have)

| Field | Question | Default if unanswered |
|---|---|---|
| `BRANCH_STRATEGY` | Branch model and naming? | Trunk-based: short-lived `feat/*`, `fix/*` from `main` |
| `REVIEW_RULES` | Reviewers, approvals, merge policy? | One approval, squash merge |
| `DEFINITION_OF_DONE` | What must be true before merge? | Tests, docs, English-only, Conventional Commit message |
| `EXTENSION_GUIDE` | How do new contributors add a feature/module? | Generic step-by-step |
| `GLOSSARY_TERMS` | Domain terms with one precise definition each? (rows only — the header is template text) | Derived from product description |

## Derivation Rules

Derive instead of asking when the answer is unambiguous:

- A stack implies its tooling: Python → `pytest`, `ruff`; Node/TypeScript → `npm`,
  `eslint`; Go → `go test`; Java → `mvn`/`gradle`.
- A stack implies the `.gitignore` variant: `node`, `python`, `go`, `rust`, `java`,
  otherwise `generic`.
- A CLI tool implies examples with a real command invocation.
- A product with no configuration options still fills `CONFIGURATION`: state that it runs
  with built-in defaults and list what a user cannot change. An empty section is rejected.
- A library implies a public API section and semantic-versioning note.
- A service implies deployment and observability sections.

Record every derivation as an assumption so the user can correct it.
