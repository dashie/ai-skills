# Template Variables

The values file is a single JSON object mapping every placeholder to a Markdown
fragment. The renderer is `scripts/scaffold.py`; run
`python3 scripts/scaffold.py --list-variables` to print this contract from the
templates themselves.

## Rules

- One key per placeholder, values are strings (an array of strings is joined with
  newlines).
- Empty or whitespace-only values are rejected: every placeholder must carry meaning.
- Never place `{{` inside a value; the renderer rejects unresolved placeholders.
- Values are Markdown fragments: write list items and tables exactly as they must
  appear, use `\n` for line breaks, and do not add code fences around whole sections.
- Do not repeat the document title or the section heading in a value: the template
  already provides them.
- Unknown keys produce a warning and are ignored; a missing key aborts the run.

## `README.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name, used as title everywhere |
| `TAGLINE` | One sentence: what it does, for whom |
| `OVERVIEW` | 3–6 sentences for a newcomer |
| `QUICK_START` | Fenced `bash` block with install, run, test |
| `STATUS` | Maturity plus what that implies |
| `DOC_MAP` | Table rows only: `\| [path](path) \| purpose \|` |

## `CONTRIBUTING.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `INTRO` | One or two sentences on the contribution culture |
| `DEVELOPMENT_WORKFLOW` | Numbered flow from branch to merge |
| `BRANCH_STRATEGY` | Base branch, naming scheme, lifetime |
| `REVIEW_RULES` | Approvals, what reviewers check |
| `DEFINITION_OF_DONE` | Checklist that must hold before merge |

## `AGENTS.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `PROJECT_PURPOSE` | 2–4 sentences: what the repository is for |

The rest of `AGENTS.md` is fixed template text and must not be reworded.

## `CLAUDE.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |

Fixed text plus the import line `@AGENTS.md`. No other content, no rules.

## `docs/PRODUCT.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `VISION` | Long-term intent in 2–4 sentences |
| `TARGET_USERS` | Bullet list of personas, each with the situation they face |
| `PROBLEM_STATEMENT` | The problem and how it is handled today |
| `VALUE_PROPOSITION` | Why this solution, in 1–3 sentences |
| `SCOPE_IN` | Bullet list of what the current milestone covers |
| `SCOPE_OUT` | Bullet list of what is explicitly excluded |
| `FUNCTIONAL_REQUIREMENTS` | List of `- \`FR-n\`: …` statements |
| `BUSINESS_RULES` | List of `- \`BR-n\`: …` statements with rationale when non-obvious |
| `NON_FUNCTIONAL_REQUIREMENTS` | Measurable targets |
| `SUCCESS_METRICS` | Observable post-release outcomes |
| `PRODUCT_ASSUMPTIONS` | `### Assumptions` and `### Open questions` subsections |

## `docs/ARCHITECTURE.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `ARCHITECTURE_OVERVIEW` | Solution shape and the top quality goals |
| `CONSTRAINTS` | Technical and organisational constraints |
| `CONTEXT_DIAGRAM` | Body of a `C4Context` Mermaid diagram, without fences |
| `CONTEXT_NOTES` | External systems, trust boundaries, inputs and outputs |
| `SOLUTION_STRATEGY` | The few decisions that shape the system |
| `CONTAINER_DIAGRAM` | Body of a `C4Container` Mermaid diagram, without fences |
| `COMPONENTS` | Table of components and responsibilities |
| `COMPONENT_CONTRACTS` | Per-component inputs, outputs, guarantees |
| `DATA_MODEL` | Entities, owners, persistence rules |
| `RUNTIME_VIEW` | A fenced `mermaid` sequence diagram of the main flow |
| `DEPLOYMENT_VIEW` | Environments, topology, configuration sources |
| `CROSS_CUTTING_CONCEPTS` | Errors, logging, security, configuration |
| `QUALITY_REQUIREMENTS` | Concrete quality scenarios |
| `ARCHITECTURE_ASSUMPTIONS` | `### Risks` and `### Technical debt` subsections |
| `INVARIANTS` | List of `- \`INV-n\`: … Enforced by …` statements |

## `docs/ADR.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `ADR_INDEX` | Index rows: `\| ADR-0001 \| title \| accepted \| YYYY-MM-DD \| decision \|` |
| `ADR_RECORDS` | Full records, `## ADR-0001 — Title` with Status, Context, Decision, Consequences, Alternatives |

`ADR-0001` is always "Adopt the documentation and repository baseline" and records
the assumptions that were accepted instead of asked about.

## `docs/GLOSSARY.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `GLOSSARY_TERMS` | Table rows: `\| **Term** \| One precise definition. \|`, alphabetical |

## `docs/DEVELOPER-GUIDE.md`

| Placeholder | Content |
|---|---|
| `PROJECT_NAME` | Project name |
| `TECH_STACK` | Languages, frameworks, runtime versions, storage |
| `PREREQUISITES` | Tools and versions to install |
| `SETUP_STEPS` | Numbered setup instructions |
| `REPO_LAYOUT` | Fenced plain-text tree, one line per entry |
| `BUILD_COMMANDS` | Commands only, one per line |
| `RUN_COMMANDS` | Commands only, one per line |
| `TEST_COMMANDS` | Commands only, one per line |
| `LINT_COMMANDS` | Commands only, one per line |
| `EXTENSION_GUIDE` | How to add a feature, module, test, migration |

The *Git Standards* section is fixed template text and must not be reworded.
