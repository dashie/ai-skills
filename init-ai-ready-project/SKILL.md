---
name: init-ai-ready-project
description: 'Bootstrap a new project repository so it is ready for AI-assisted development, and bring an already initialized repository up to the current standard. Use when asked to create/initialize/scaffold/bootstrap a new project, repo, or codebase, or to set up its project documentation (README, CONTRIBUTING, docs/PRODUCT.md, docs/USER-GUIDE.md, docs/ARCHITECTURE.md, docs/ADR.md, docs/GLOSSARY.md, docs/DEVELOPER-GUIDE.md) and agent instructions (AGENTS.md plus a CLAUDE.md import). Also use when an existing repository already carries this baseline and its rules or standards changed and must be re-applied. Reads the user project description, interviews the user for missing information instead of inventing it, and renders deterministic templates.'
argument-hint: '<project description> [destination path]'
---

# Initialize an AI-Ready Project

Create the documentation baseline that lets a human and an AI agent work on a new
repository without guessing: what the product is, how to use and configure it, how the
system is built, which decisions were made, what the words mean, how to build and test,
and how to contribute.

**Everything this skill writes is in English**, including prose, headings, commit
messages, code, comments, identifiers, and file names. The target repository has a
single allowed language for text: English.

## When to Use

- The user asks to create, initialize, bootstrap, or scaffold a new project or repo.
- The user provides a project description and wants the standard docs generated.
- An existing repository is missing `README.md`, `CONTRIBUTING.md`, `docs/*.md`,
  `AGENTS.md`, or `CLAUDE.md` and needs that baseline.
- An existing repository is **already initialized with this skill** and must be brought
  up to the current standard because the skill added, changed, or removed rules — see
  [Updating an existing baseline](#updating-an-existing-baseline).

## Deliverables

Exactly these files, rendered from the templates in [assets/templates](./assets/templates):

| File | Role |
|---|---|
| `README.md` | Entry point: purpose, quick start, documentation map |
| `CONTRIBUTING.md` | How to contribute: branching, review, definition of done |
| `docs/PRODUCT.md` | Purpose, users, scope, functional behaviour, business rules |
| `docs/USER-GUIDE.md` | How end users use and configure the product; every configuration option. Self-contained: distributed on its own |
| `docs/ARCHITECTURE.md` | arc42 + C4 structure, components, contracts, invariants |
| `docs/ADR.md` | Index of architecture decision records and their rationale |
| `docs/GLOSSARY.md` | Domain language, one precise definition per term |
| `docs/DEVELOPER-GUIDE.md` | Build, run, test, extend; Git process and policy, linking the commit contract |
| `.github/copilot-commit-message-instructions.md` | The commit message contract (single source), read by VS Code when drafting a message |
| `.github/copilot-pull-request-instructions.md` | The pull request contract (title and description) |
| `.vscode/settings.json` | Registers both instruction files for commit and pull request generation |
| `AGENTS.md` | Agent instructions: repository layout, English-only rule, doc map (single source) |
| `CLAUDE.md` | Two-line pointer that imports `AGENTS.md` with `@AGENTS.md` |
| `.gitignore` | Language-appropriate ignore rules (`<variant>.gitignore` + `_common.gitignore`) |

Never add other files. Never generate a different document set unless the user
explicitly asks.

The six default documents this skill installs under `docs/` use fully uppercase
filenames, exactly as listed above. Any other documentation file under `docs/` must use
ordinary filename casing (for example, `project-notes.md`), not an all-uppercase name.

The scaffold also records one thing **outside** the destination: the approval that lets
an agent run the skill scripts in that repository without a prompt each time, written as
a location entry in `~/.copilot/permissions-config.json` (see
[Run the scaffold](#5-render-the-scaffold)). It is not a deliverable of the repository,
it never fails the run, and `--no-allow-skills` skips it.

### Managed blocks

Every piece of fixed text the skill owns is delimited in the templates — and therefore
in the generated files — by a pair of HTML comments:

```
<!-- skill:block:<id> [attrs] -->
... fixed text ...
<!-- skill:end:<id> -->
```

These markers are what makes updates possible: they are the only contract that says
"this text belongs to the skill, replace it when the skill changes". They are invisible
in rendered Markdown and must never be removed, reworded, or hand-edited. Prose outside
the markers is the project's: placeholders, project-specific paragraphs, and sections
the templates fill from values. The two `.github/copilot-*-instructions.md` files are a
single block each, because the skill owns them entirely.

`.vscode/settings.json` is the one exception: JSON cannot carry HTML markers, so it is
merged (missing keys added, existing keys preserved) instead of updated by block.

## Procedure

### 1. Inspect the destination

- Resolve the destination: use the path the user gave, otherwise the current
  working directory.
- List existing files (`ls -a`, and `git status` if it is a repository).
- If a deliverable already exists, do not overwrite it: report it and ask whether
  to skip it or update it in place. A repository that already carries this baseline is
  updated with `scripts/update.mjs` — see
  [Updating an existing baseline](#updating-an-existing-baseline) — never re-rendered
  over.

### 2. Extract facts from the description

Read the description the user supplied. Map it to the intake fields listed in
[references/intake-checklist.md](./references/intake-checklist.md). Mark each field
as **known**, **derivable**, or **missing**.

- *Known*: stated by the user.
- *Derivable*: follow unambiguously from what was stated (e.g. a Python CLI implies
  `python` gitignore and `pytest` as the default test runner). Record it as an
  assumption, do not ask.
- *Missing*: must be answered by the user.

### 3. Interview for what is missing

Use the `ask_user` tool — never plain text questions — and batch related fields into
one form (maximum 8 fields per round, ordered as they appear in the intake
checklist). Ask at most two rounds: after that, fall back to explicit, visible
assumptions.

Guidelines:

- Ask only `must-have` fields; fill `nice-to-have` fields with assumptions.
- Offer sensible options with a recommended default so the user can answer quickly.
- Never invent scope, users, business rules, components, or technology choices.
- When the user declines to answer, write the assumption explicitly into the
  generated document under the `### Assumptions` or `### Open questions` subsection
  provided by the template.

### 4. Prepare the values file

Produce a JSON object with one value per placeholder declared in
[references/template-variables.md](./references/template-variables.md). Values are
Markdown fragments; use `\n` for line breaks and do not wrap values in backticks or
code fences. Write the file outside the destination tree (e.g.
`<session>/files/init-values.json`) and delete it after the run.

To see the exact contract before writing values:

```bash
aispec scaffold --list-variables
```

Content requirements per document are in
[references/document-contracts.md](./references/document-contracts.md).

### 5. Render the scaffold

```bash
aispec scaffold \
  --dest "<destination>" \
  --values "<values.json>" \
  --gitignore <generic|node|python|go|rust|java>
```

The script copies the templates and substitutes placeholders. It is deterministic:
same values, same bytes. It fails if a value is missing or empty, if a placeholder
remains, or if a target file already exists (pass `--force` only when the user
approved overwriting). Use `--dry-run` first when unsure.

`.vscode/settings.json` is the exception: the two generator settings are merged into an
existing file and reported as `merged N key(s)`, `unchanged`, or `skipped` when the
file is not plain JSON. Existing values are never changed.

The script then approves the skills for the destination and prints
`approved the skills for <location> in <config>`. That entry — an `aispec:*` command
approval plus the skills directory in `allowed_directories`, keyed by the repository
root — is what lets the agent run the skills in the new repository without a prompt.
It is per location, it merges with whatever the file already holds, and a failure is a
warning with the manual command, never a failed scaffold. Pass `--no-allow-skills` when
the user does not want the scaffold to touch their Copilot configuration.

### 6. Verify

```bash
aispec check --dest "<destination>"
```

The checker fails on a missing or empty file, a leftover placeholder, a broken
relative link, or a missing fixed section (`Git Standards` and `### Design rules` in
the developer guide, `### Architecture principles` in the architecture document, the
`## Engineering principles` section in `AGENTS.md`, the English-only rule and
documentation map and the `## AI skills` section in `AGENTS.md`, the `## AI skills`
section in `docs/DEVELOPER-GUIDE.md`, the tests sentence in `CONTRIBUTING.md`, the
`## How to use it` and `## Configuration` sections plus the maintenance rules in
`docs/USER-GUIDE.md`). It also fails when the `## What it is` summary in
`docs/USER-GUIDE.md` is not a single paragraph of at most three lines, or when the guide
links to another repository document instead of standing alone. Fix the values
file and re-render with `--force`; never patch the generated files by hand.

The checker also fails when a managed block marker is missing or unbalanced, or when a
block the templates declare is absent from a generated file.

Additional manual check: read `docs/DEVELOPER-GUIDE.md` and `AGENTS.md` once and
confirm nothing from the templates was reworded.

### 7. Report

Summarize what was created, which facts came from the user, which are assumptions,
and which open questions remain. State that the skills are now approved for the
repository (or that `--no-allow-skills` skipped it, and that
`aispec allow` does it later). Explain the split: `AGENTS.md` holds the
instructions and is read natively by GitHub Copilot CLI, GitHub Copilot in VS Code,
the VS Code Local harness, and OpenAI Codex; `CLAUDE.md` imports it with `@AGENTS.md`
so Anthropic Claude reads the same text. Rules are edited in `AGENTS.md` only.

Do not commit, tag, or push: finish with the changed files and a proposed
Conventional Commits message, and let the user approve and save the change in Git.

Initialize Git only if the user asks (`git init -b main`); never commit unless asked.

## Updating an existing baseline

Use this when the repository already carries the baseline and the skill has changed:
rules added, rules reworded, rules removed, a fixed section introduced. The project's
own content — placeholders, values, project-specific prose — is never re-rendered, so
the update cannot destroy facts the user supplied.

Full rules and limitations: [references/update-procedure.md](./references/update-procedure.md).

### 1. Inspect before touching

```bash
aispec update --dest "<repo>" --dry-run
```

The dry run lists, per file: `updated` (existing managed block replaced), `adopted`
(unmarked text matched a managed block and was wrapped in markers), `inserted` (a new
managed block added at its anchor), `removed` (a block the templates no longer define).
Show the list to the user before writing.

### 2. Apply

```bash
aispec update --dest "<repo>"
```

The script is idempotent: a second run reports `baseline OK` and changes nothing. It
never touches `.gitignore`, never invents values, and never creates or deletes a
deliverable — a missing deliverable is reported as an error.

### 3. Verify

```bash
aispec check --dest "<repo>"
git --no-pager diff
```

Read the diff: it must contain only managed-block changes. If it shows project prose
rewritten, stop and restore the file — the block boundary is wrong and must be fixed
in the template, not patched in the repository.

### 4. Report

State which blocks changed, which were added, which were removed, and what the user
must review by hand. Propose a `docs(baseline): ...` Conventional Commits message with
the skill version or the rule names. Never commit or push.

Two cases need a manual decision instead of a script:

- A repository initialized **before markers existed** and whose fixed text was edited
  by hand: `adopted` replaces whole sections by heading, so local edits inside a fixed
  section are lost. Say so in the report.
- A removed rule whose text is still unmarked in the repository: it cannot be detected
  automatically. Ask the user, or point at it in the diff.

## Hard Rules

- **English only, in generated files.** No other language appears in any generated
  file. The rule governs the output, never the input: accept a request written in any
  language, answer it, and keep every artefact in English.
- **No invented facts.** Missing information is asked for or declared as an assumption.
- **Templates are the source of truth.** The `AGENTS.md` engineering principles (KISS,
  modularity and decoupling, tests with every change), the `AGENTS.md` and `CLAUDE.md`
  pointer text, the architecture principles in `docs/ARCHITECTURE.md`, the design and
  test rules in `docs/DEVELOPER-GUIDE.md`, the two `.github/copilot-*-instructions.md`
  contracts, and the Git process rules are fixed text from the templates; never
  rewrite or drop them per project. Only placeholders vary. Rules live in `AGENTS.md`,
  never in `CLAUDE.md`.
- **One copy of each rule.** The commit message contract exists only in
  `.github/copilot-commit-message-instructions.md`; every other file links to it. Never
  copy the type table or the examples into `docs/DEVELOPER-GUIDE.md`, `AGENTS.md`, or
  `CONTRIBUTING.md`.
- **The user guide is self-contained and always current.** `docs/USER-GUIDE.md` is meant
  to be distributed on its own, so it never links to the other documents, its
  `## What it is` summary stays at most three lines, and it lists every configuration
  option the product accepts — name, default, accepted values, effect. A change that
  alters user-visible behaviour or a configuration option updates the guide in the same
  change; the managed block `userguide-currency` carries that rule into every repository.
- **Fixed text is edited in the template, never in the target.** Every fixed block is
  wrapped in `<!-- skill:block:<id> -->` / `<!-- skill:end:<id> -->`; a change to the
  standard is a template edit followed by `update.mjs` on the repository. Never hand-edit
  a managed block in a target repository and never remove its markers.
- **Update preserves project content.** `update.mjs` touches managed blocks only: it
  never re-renders placeholders, never rewrites project prose, never edits
  `.gitignore`, and never creates or deletes deliverables.
- **User-owned Git history.** Never run `git commit`, `git push`, `git tag`, merge,
  rebase, or any history rewrite, and never open or merge a pull request. Only the
  user approves and saves a change in Git. Report the proposed commit message instead.
- **Never overwrite silently.** Existing files require explicit approval.
- **No filler.** Prefer short, precise, verifiable statements over marketing prose.

## References

- [Intake checklist](./references/intake-checklist.md) — what to ask and why
- [Document contracts](./references/document-contracts.md) — required content per file
- [Template variables](./references/template-variables.md) — placeholder contract
- [Git standards](./references/git-standards.md) — where each Git rule lives, and why the
  commit contract is a separate file
- [Update procedure](./references/update-procedure.md) — managed blocks, anchors, limits
- [scaffold.mjs](./scripts/scaffold.mjs) — deterministic renderer
- [update.mjs](./scripts/update.mjs) — bring an initialized repository to the current standard
- [check-output.mjs](./scripts/check-output.mjs) — post-render verification

All three scripts import the shared helpers from `lib/` at the skills repository
root, so run them from a full checkout through the dispatcher: `aispec <verb>`
(inside the checkout, `node <skill-root>/scripts/<name>.mjs` works the same).
