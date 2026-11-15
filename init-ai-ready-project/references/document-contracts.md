# Document Contracts

Required content for each generated file. The templates already contain the section
skeleton; these contracts define what "meaningful" means for each section.

## Managed blocks

Fixed text — rules the skill owns — lives inside
`<!-- skill:block:<id> -->` … `<!-- skill:end:<id> -->` markers. The inventory of block
ids, the anchor attributes, and the update rules are in
[update-procedure.md](./update-procedure.md). A generated file must contain every block
its template declares, with balanced markers; the checker enforces it. Text outside the
markers is project content and must not be rewritten by an update.

## README.md

- One-line tagline, then a short overview (3–6 sentences) aimed at a newcomer.
- `Quick start`: prerequisites in one line, then the exact commands to install, run,
  and test — copy-pasteable, no placeholders left.
- `Documentation map`: table linking every file in `docs/` with one line of purpose,
  including `docs/USER-GUIDE.md`.
- `Status`: project maturity (prototype / alpha / beta / production) and what that
  implies.
- No marketing adjectives, no badges unless the user asked for them.

## CONTRIBUTING.md

- How to propose work: issue first for anything larger than a trivial fix.
- Branch strategy: base branch, naming (`feat/<slug>`, `fix/<slug>`, `docs/<slug>`),
  one logical change per branch.
- Commit rules: a three-line summary plus a pointer to
  `.github/copilot-commit-message-instructions.md` — the pointer, never the contract.
- Review rules: number of approvals, what reviewers check, how feedback is resolved.
- Definition of done: tests pass, docs updated, English only, no leftover TODOs
  without an issue reference.
- Pull request expectations: scope, description, linked issue, screenshots when UI
  changes, and the fixed rules that a change ships with its tests, keeps modules
  decoupled, and prefers the simplest design (KISS).

## docs/PRODUCT.md

- Purpose and vision: why the product exists.
- Users and personas: who uses it, in which situation, what they need.
- Problem statement and value proposition.
- Scope: explicit in-scope and out-of-scope lists for the current milestone.
- Functional behaviour: numbered requirements, each independently testable
  (`FR-1`, `FR-2`, …), stated as observable behaviour, not implementation.
- Business rules: domain constraints that always hold (`BR-1`, …), each with a
  rationale when non-obvious.
- Non-functional requirements: measurable targets (latency, availability, limits).
- Success metrics and open questions with an owner.

## docs/USER-GUIDE.md

The end-user document. It is **distributed on its own**, so it must be self-contained: no
link to `PRODUCT.md`, `ARCHITECTURE.md`, `DEVELOPER-GUIDE.md`, or any other repository
document, and no reference that only makes sense inside the repository.

- `What it is`: one short paragraph, **at most three lines**, stating what the product is
  and who it is for. The checker enforces the limit: one paragraph, three lines maximum.
- `How to use it`: install, start, and use — numbered steps with real commands, then one
  example of the main flow a user performs.
- `Configuration`: every option the product accepts, one row each — name, type, default,
  accepted values, and effect. Add a minimal example configuration file when the product
  reads one. An option missing here is an undocumented feature; an option here that the
  product no longer accepts is a stale instruction.
- *Keeping this guide current*: fixed template text, managed block `userguide-currency`. It
  states that the guide is updated in the same change as the behaviour it documents. Do not
  reword or remove it.
- Language: user-facing, second person, no internal identifiers unless the user types them.

## docs/ARCHITECTURE.md

Follow arc42, sections 1–12, in order. Keep each section short and concrete.

1. Introduction and goals — top quality goals, stakeholders.
2. Constraints — technical, organisational, conventions.
3. Context and scope — C4 **System Context** diagram (C4-PlantUML `C4_Context`) plus
   the external systems and actors with their inputs/outputs.
4. Solution strategy — the handful of decisions that shape the system, followed by the
   fixed `### Architecture principles` subsection (KISS, modular and decoupled
   modules, testability). Never reword or remove it.
5. Building block view — C4 **Container** and **Component** diagrams (C4-PlantUML
   `C4_Container`, `C4_Component`), one table of components with responsibilities.
6. Runtime view — at least one end-to-end flow (PlantUML sequence diagram) for the main
   use case.
7. Deployment view — environments, topology, and configuration sources.
8. Cross-cutting concepts — error handling, logging/observability, security,
   configuration, data ownership.
9. Architecture decisions — link to `docs/ADR.md`, never duplicate rationale here.
10. Quality requirements — quality tree and concrete scenarios.
11. Risks and technical debt — with mitigation or a follow-up issue.
12. Glossary — link to `docs/GLOSSARY.md`, never redefine terms here.

Additionally required, as dedicated subsections:

- **Component contracts**: for each component, its inputs, outputs, and guarantees.
- **Invariants**: numbered statements (`INV-1`, `INV-2`, …) that must hold in every
  change, each with how it is enforced or tested.

All diagrams are PlantUML: a `plantuml` fenced block containing `@startuml` and
`@enduml`. No other diagram format (Mermaid, Graphviz, ASCII art) is allowed in any
document. C4 diagrams use the C4-PlantUML library (`!include <C4/C4_Context>` and
similar). Validate the syntax with a PlantUML renderer before committing. Every diagram
gets a caption and a one-sentence takeaway.

## docs/ADR.md

- A short explanation of the ADR process: when a decision deserves a record, who
  decides, and how records are superseded (never deleted).
- `index` table: ID, title, status (`proposed` / `accepted` / `superseded by ADR-XXXX`),
  date, one-line decision.
- One record per decision, in the same file, in compact form: context, decision,
  consequences, alternatives considered.
- `ADR-0001` is always "Adopt the documentation and repository baseline produced by
  this initialization", listing the decisions taken from assumptions.
- Records are append-only; changing a decision means a new record.

## docs/GLOSSARY.md

- One table, alphabetically ordered, terms in **bold**, always under the fixed
  `| Term | Definition |` header and separator; content rows are appended below it.
- Exactly one definition per term; no circular definitions; no synonyms ("also
  called X" is allowed only when the alternative is used in the codebase).
- Definitions are domain language, not implementation notes.
- Every term that appears capitalised or in quotes in other documents must be listed.

## docs/DEVELOPER-GUIDE.md

- Tech stack and supported versions.
- Prerequisites and environment setup, including how to verify the setup works.
- Build, run, test, lint commands: exact commands, one per line, no prose inside the
  code block, expected output summarised afterwards.
- Repository layout: directory tree with one line per entry.
- Extension guide: where to add a feature, a module, a test, a migration, and how to
  wire it up, followed by the fixed `### Design rules` subsection (place code in the
  owning module, contracts only, KISS, tests in the same change).
- The fixed test rules under `## Test`: every change ships with the tests of the part
  it changes, tests run per module with the others substituted by fakes.
- The fixed **AI skills** section: where the skills live, the commands that approve and
  revoke them for the repository, what the approval writes in
  `~/.copilot/permissions-config.json`, and that non-interactive runs need
  `--allow-tool 'shell(aispec:*)' --add-dir <skills>` instead.
- **Git Standards** section: fixed, template-owned text defining the *process* — the
  rule that automated agents never commit or push, a summary of concise Conventional
  Commits with a link to the contract, branch naming and integration, the pull request
  pointer, and the English-only rule. It must **not** restate the type table, the
  subject and body rules, or the examples: those live in
  `.github/copilot-commit-message-instructions.md` and a second copy drifts.
  Do not reword it per project.

## .github/copilot-commit-message-instructions.md

The single source of truth for the commit message format, and the file VS Code reads
when it drafts a commit message (registered in `.vscode/settings.json`). The whole
file is one managed block `commit-message-standard`, with no placeholder.

Must contain: format, the type table with the use of each type, scope rules, subject
rules, body rules, footers and breaking changes, a "do not" list, worked examples, and
a list of rejected examples with the reason. Written as directives to a writer, not as
prose about writing.

## .github/copilot-pull-request-instructions.md

The pull request contract, managed block `pull-request-standard`, no placeholder.
Contains the title format (a Conventional Commits subject, because a squash merge
turns it into the commit subject), the required description sections (problem,
approach, verification, scope), the required content (issue link, affected modules,
contract changes, visible effect, screenshots), and the review rules.

## .vscode/settings.json

Generated, merged, and **not** managed by markers: JSON cannot carry HTML comments and
a repository usually already has editor settings.

It registers the two instruction files:

```json
"github.copilot.chat.commitMessageGeneration.instructions": [
  { "file": ".github/copilot-commit-message-instructions.md" }
],
"github.copilot.chat.pullRequestDescriptionGeneration.instructions": [
  { "file": ".github/copilot-pull-request-instructions.md" }
]
```

Rules: add a key only when it is absent, never change or remove an existing value,
never reformat the rest of the file beyond `json.dump(..., indent=2)`, and report which
keys were merged. Both settings are marked Experimental in the VS Code documentation,
which is why the instruction files are also linked from the documents above.

The file must not be ignored by `.gitignore`: `.vscode/*` is excluded with
`!.vscode/settings.json` re-included in `_common.gitignore`, and no language variant may
exclude the `.vscode/` directory as a whole, because Git cannot re-include a file inside
an excluded directory.

## AGENTS.md

This is the single source of truth for agent instructions. It is read natively by
GitHub Copilot CLI, GitHub Copilot in VS Code, the VS Code Local harness, and OpenAI
Codex.

- Fixed template text, reused deterministically: only `PROJECT_NAME` and
  `PROJECT_PURPOSE` vary.
- Repository purpose and the layout agents must expect.
- The **engineering principles** section, fixed and non-negotiable: simplicity first
  (KISS) at every level, modularity with decoupled independently tooled modules, and
  tests shipped with every change.
- The **language rule**: every artefact in the repository is written in English —
  prose, commits, comments, identifiers, file names, tests, issues, and UI strings.
- The **Git rule**: the agent never commits or pushes; only the user approves and
  saves a change in Git. Read-only Git commands are allowed.
- Short summary of the commit standard, pointing at
  `.github/copilot-commit-message-instructions.md` for the contract and at
  `docs/DEVELOPER-GUIDE.md` for branch and merge policy.
- Documentation map explaining each standard Markdown file and when to update it.
- Working agreement: read the docs before changing behaviour, update the doc touched
  by the change, ask instead of inventing, keep changes surgical, keep the design
  simple and the modules decoupled, ship tests with the change.
- The **AI skills** section: which skills are installed at `~/.copilot/skills`, that
  their scripts are tooling run with `node` and never edited from this repository, and
  how to restore the permission approval (`aispec allow`) when a run still
  prompts. Name the skills, do not document them in detail: their own `SKILL.md` does.

## CLAUDE.md

A pointer file, not a second copy of the rules: two fixed paragraphs plus the import
line `@AGENTS.md`, and only `PROJECT_NAME` varies.

Why it exists: Anthropic Claude reads `CLAUDE.md` in preference to `AGENTS.md`
(Claude Code reads `AGENTS.md` only when no `CLAUDE.md` exists, from v2.1.277). A
`CLAUDE.md` containing `@AGENTS.md` makes Claude include the `AGENTS.md` content
through the import, so every harness — Copilot CLI, Copilot in VS Code, VS Code
Local, Codex, Claude — reads the same text from one file.

Never write rules into `CLAUDE.md`; edit `AGENTS.md` and let the import carry them.
