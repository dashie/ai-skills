---
name: init-devcontainer-ai-sandbox
description: 'Initialize the current repository as an isolated Docker dev-container where an AI agent can work unattended for hours with full permissions and no approval prompts, or remove that setup again. Use when asked to initialize/set up/add a sandbox or dev-container for AI agents, to sandbox/containerize the development environment, to enable autonomous or unattended agent runs, to run Copilot CLI with --allow-all / --yolo safely, to add a .devcontainer with hardening, a git write guard, and long-run scripts, or to uninstall/remove/undo that sandbox configuration from a project.'
argument-hint: '[stack or extra constraints]'
---

# Initialize a Dev-Container AI Sandbox

Wrap the current project in a Docker-based dev-container that is safe enough to give
an AI agent **full permissions and hours of unattended runtime**, because the blast
radius is the container — not the host, not the repository history, not the
credentials.

The sandbox provides four guarantees:

1. **No host escape hatch**: no Docker socket, no host home directory, no SSH keys,
   no cloud credentials, non-root user, `cap-drop=ALL`, `no-new-privileges`.
2. **Bounded resources**: CPU, memory, and PID limits, plus a disposable container.
3. **Read-only Git**: a `git` shim inside the image refuses history-changing commands,
   so an agent with `--allow-all` still cannot commit, push, tag, merge, or rewrite.
4. **Repeatable long runs**: a launcher script with logging, resume, and autopilot
   continue limits, plus chat-UI permission settings in `devcontainer.json`, so
   neither the CLI nor the chat UI asks for approval every couple of minutes.
5. **Pre-approved skills tooling**: the Copilot skills repository is bind-mounted
   read-only at `/home/dev/.copilot/skills`, its `aispec` dispatcher is on `PATH` via
   a `/usr/local/bin` symlink, and running it is approved in both the chat UI and the
   CLI, so a skill invocation never stalls a long run.

Copilot Chat models come from workspace extensions running **inside** the container, so
model-provider extensions installed on the host (BYOK providers contributing
`languageModelChatProviders`) are listed in `customizations.vscode.extensions` too —
otherwise their models are missing from the model picker while the Copilot ones remain.

## When to Use

- The user wants agent work to run unattended for a long time without approvals.
- The user asks to sandbox or containerize the development environment.
- The user wants to run an agent with all permissions (`--allow-all`, `--yolo`) or
  `--dangerously-skip-permissions` without risking the host.
- A repository already has a dev-container but it mounts `~/.ssh`, the Docker socket,
  or the host home directory — harden it.
- The user wants to remove, uninstall, or undo the sandbox this skill installed.

## Deliverables

`agent-sandbox.md` is an additional document, not one of the six default `docs/`
files installed by `init-ai-ready-project`, so it uses ordinary lowercase filename
casing.

| File | Role |
|---|---|
| `.devcontainer/devcontainer.json` | Container definition, mounts (including the read-only skills mount), limits, chat-UI autonomy settings |
| `.devcontainer/Dockerfile` | Base image, tooling, Copilot CLI (`@github/copilot`), non-root user, sudo purge |
| `.devcontainer/stack-tools.sh` | Stack-specific build steps as plain shell, run at image build |
| `.devcontainer/post-create.sh` | One-time setup: git identity, safe.directory, CLI permissions seed, checks |
| `.devcontainer/git-guard.sh` | `git` shim installed as `/usr/local/bin/git` in the image |
| `.agent/goal.md` | Template for the objective of an autonomous run |
| `.agent/run.sh` | Unattended launcher: log, timeout, detach, resume |
| `docs/agent-sandbox.md` | Threat model, first run, autonomy flags, recovery |
| `AGENTS.md` | Appended section: sandbox rules and the read-only Git policy |
| `docs/DEVELOPER-GUIDE.md` | Appended section: how to run the sandbox |

Snippets appended to existing documents are delimited by
`<!-- BEGIN agent-sandbox -->` / `<!-- END agent-sandbox -->` so re-running the skill
never duplicates text. Files are never overwritten without `--force`.

`uninstall-sandbox.mjs` reverses exactly this set: it deletes the generated files, cuts
the marked blocks out of `AGENTS.md`, `docs/DEVELOPER-GUIDE.md`, and removes the
`.gitignore` entry — nothing else.

## Procedure

### 1. Inspect the project

- Detect the stack from manifests: `package.json`, `pyproject.toml`, `go.mod`,
  `Cargo.toml`, `pom.xml`, `build.gradle*`, `*.csproj`, `Gemfile`, `composer.json`.
- Check for an existing `.devcontainer/` and for `AGENTS.md`,
  `docs/DEVELOPER-GUIDE.md`, `docs/agent-sandbox.md`.
- Refuse to continue silently if `.devcontainer/` exists: report the difference and
  ask before overwriting.

### 2. Ask only what cannot be derived

Use the `ask_user` tool for these, batching them in one form:

- Base image family: official dev-container image for the stack (`mcr.microsoft.com/devcontainers/javascript-node:22`,
  `python:3.12`, `go:1.22`, `rust:1`, `java:21`, or `base:ubuntu-24.04`).
- Memory and CPU limits (`8g` / `4` by default).
- Whether the agent must reach private registries (if yes, add an allowlist note to
  the docs; open egress is the default).
- Anything the stack needs that the manifest does not reveal (database, system
  packages, private package index).

Derive these instead of asking:

- Copilot Chat model providers already installed on the host:
  `aispec sandbox-scaffold --detect-model-providers`
  returns a JSON array of ids. Pass it as `MODEL_PROVIDER_EXTENSIONS`; the script merges
  it into `VSCODE_EXTENSIONS` so those models are available inside the container.
- Extensions the stack obviously needs (language, linter, formatter) for
  `VSCODE_EXTENSIONS`.
- The skills repository path: `${localEnv:HOME}/.copilot/skills` is mounted read-only
  at `/home/dev/.copilot/skills` and pre-approved for `node` runs. Keep it unless the
  user says the skills live elsewhere; ask only when that host path does not exist.

Record the derivation notes in `docs/agent-sandbox.md` under *Assumptions*.

### 3. Fill the values file

```bash
aispec sandbox-scaffold --list-variables
```

Write a JSON object with one value per placeholder; see
[references/template-variables.md](./references/template-variables.md). Keep the
values file outside the repository (for example `<session>/files/sandbox-values.json`).

### 4. Render

```bash
aispec sandbox-scaffold \
  --dest "<repository root>" \
  --values "<values.json>"
```

The script is deterministic and idempotent: it copies templates, substitutes
placeholders, and appends the snippets only when their markers are absent. Use
`--dry-run` first, `--force` only with user approval.

### 5. Verify

```bash
aispec sandbox-verify --dest "<repository root>"
```

Static checks: JSONC parses, no `docker.sock`, no host home or SSH mounts, the
skills repository mounted read-only at `/home/dev/.copilot/skills`, non-root user,
`cap-drop=ALL`, `no-new-privileges`, resource limits, a well-formed
`customizations.vscode.extensions` list, chat-UI autonomy
settings (`chat.permissions.default`, `chat.agent.maxRequests`, terminal auto-approve
map with pattern-based refusals and `aispec` approved), the CLI permissions seed in
`post-create.sh` (`aispec:*` plus the skills directory), the `aispec` symlink and the
`git` shim installed in the Dockerfile, the launcher executable, `ping` installed and
capless with the `ping_group_range` sysctl, the doc sections.

Then, with user approval, run the real build once:

```bash
docker build -t <project>-sandbox -f .devcontainer/Dockerfile .devcontainer
docker run --rm <project>-sandbox id -u            # must not be 0
docker run --rm <project>-sandbox git commit -m x  # must exit 97
docker run --rm <project>-sandbox sh -c 'command -v sudo'  # must find nothing
docker run --rm <project>-sandbox ping -c 1 127.0.0.1      # must reply
```

`verify-sandbox.mjs --docker-build` runs exactly these checks. A sandbox that has
never been built is not verified.

### 6. Report

List the files created or updated, the isolation measures, the pre-approved skills
tooling, the exact commands to start a long unattended run, and the remaining risks
(open egress, model provider outage, quota exhaustion). Do not commit or push
anything: the user owns Git history.

## Removing the Sandbox

When the user wants the sandbox gone, remove it with the paired uninstaller instead of
deleting paths by hand: it knows the exact file set the scaffolder writes and leaves the
project's own content alone.

```bash
aispec sandbox-uninstall --dest "<repository root>" --dry-run
aispec sandbox-uninstall --dest "<repository root>"
```

Always show the `--dry-run` output first: it prints each path with `would remove`,
`would edit`, `absent`, or `kept`. Apply only after the user agrees with that list.

What it does:

| Target | Action |
|---|---|
| `.devcontainer/*`, `.agent/run.sh`, `.agent/goal.md`, `docs/agent-sandbox.md` | deleted |
| `AGENTS.md`, `docs/DEVELOPER-GUIDE.md` | the `<!-- BEGIN agent-sandbox -->` … `<!-- END agent-sandbox -->` block is cut out; the file is deleted only when nothing but the generated heading would remain |
| `.gitignore` | the `# AI sandbox run logs` / `.agent/logs/` pair is removed; the file is deleted when it ends up empty |
| `.devcontainer/`, `.agent/` | pruned when empty, kept with a `kept … (unrelated content: …)` line otherwise |
| anything else | never touched |

Safety rules the script enforces and the agent must not work around:

- **Plan then act.** Markers are validated before anything is deleted; a `BEGIN` without
  `END` (or the reverse) aborts with exit 1 and leaves the project untouched. Report the
  message and let the user fix the file — do not edit around it.
- **Only the generated set.** Never delete `.agent/logs/` (run history), a user's own
  `.devcontainer/` additions, or any document the skill did not write.
- **Idempotent.** A second run reports `absent` everywhere and exits 0.
- **Containers first.** If a container or the Dev Containers window still uses the image,
  say so before removing: stop the container, then uninstall.

After applying, confirm the result with `git status --short` (the diff should contain only
the deletions and cuts above) and report the removed paths, the kept ones, and what the
user must do next — the image (`docker build` tag) is not removed by the script.

## Hard Rules

- **Never mount the Docker socket, the host home, `~/.ssh`, `~/.aws`, `~/.config/gh`,
  or any host credential directory into the sandbox.** Named volumes only, with one
  exception: the skills repository at `~/.copilot/skills`, bind-mounted **read-only**
  at `/home/dev/.copilot/skills` and pre-approved for `node` script runs.
- **Never run the agent as root.** The image must define a non-root user and
  `remoteUser` must be that user.
- **Keep the read-only Git policy.** The `git` shim is installed in the image, not
  optional. Document that it is a guardrail, not a jail: isolation comes from Docker.
- **No silent overwrite.** Existing files require `--force` and user approval.
- **No silent deletion.** Removal goes through `uninstall-sandbox.mjs` after a `--dry-run`
  the user approved; never delete sandbox files, documents, or `.gitignore` entries by hand.
- **English only** in every generated file.
- **User-owned Git history.** Never commit or push from the host or the sandbox.

## References

- [Container hardening](./references/container-hardening.md) — every isolation control and why
- [Autonomy flags](./references/autonomy-flags.md) — verified Copilot CLI options for unattended runs
- [Template variables](./references/template-variables.md) — placeholder contract
- [scaffold-sandbox.mjs](./scripts/scaffold-sandbox.mjs) — renderer
- [verify-sandbox.mjs](./scripts/verify-sandbox.mjs) — checks
- [uninstall-sandbox.mjs](./scripts/uninstall-sandbox.mjs) — remover, the reverse of the renderer

All scripts import the shared helpers from `lib/` at the skills repository root, so run them from a full checkout through the dispatcher: `aispec <verb>`
(inside the checkout, `node <skill-root>/scripts/<name>.mjs` works the same).
