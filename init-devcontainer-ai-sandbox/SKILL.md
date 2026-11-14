---
name: init-devcontainer-ai-sandbox
description: 'Initialize the current repository as an isolated Docker dev-container where an AI agent can work unattended for hours with full permissions and no approval prompts. Use when asked to initialize/set up/add a sandbox or dev-container for AI agents, to sandbox/containerize the development environment, to enable autonomous or unattended agent runs, to run Copilot CLI with --allow-all / --yolo safely, or to add a .devcontainer with hardening, a git write guard, and long-run scripts.'
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
   read-only at `/home/dev/.copilot/skills`, and running its node scripts is approved
   in both the chat UI and the CLI, so a skill invocation never stalls a long run.

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

## Deliverables

| File | Role |
|---|---|
| `.devcontainer/devcontainer.json` | Container definition, mounts (including the read-only skills mount), limits, chat-UI autonomy settings |
| `.devcontainer/Dockerfile` | Base image, tooling, Copilot CLI (`@github/copilot`), non-root user, sudo purge |
| `.devcontainer/stack-tools.sh` | Stack-specific build steps as plain shell, run at image build |
| `.devcontainer/post-create.sh` | One-time setup: git identity, safe.directory, CLI permissions seed, checks |
| `.devcontainer/git-guard.sh` | `git` shim installed as `/usr/local/bin/git` in the image |
| `.agent/goal.md` | Template for the objective of an autonomous run |
| `.agent/run.sh` | Unattended launcher: log, timeout, detach, resume |
| `docs/AGENT-SANDBOX.md` | Threat model, first run, autonomy flags, recovery |
| `AGENTS.md` | Appended section: sandbox rules and the read-only Git policy |
| `docs/DEVELOPER-GUIDE.md` | Appended section: how to run the sandbox |

Snippets appended to existing documents are delimited by
`<!-- BEGIN agent-sandbox -->` / `<!-- END agent-sandbox -->` so re-running the skill
never duplicates text. Files are never overwritten without `--force`.

## Procedure

### 1. Inspect the project

- Detect the stack from manifests: `package.json`, `pyproject.toml`, `go.mod`,
  `Cargo.toml`, `pom.xml`, `build.gradle*`, `*.csproj`, `Gemfile`, `composer.json`.
- Check for an existing `.devcontainer/` and for `AGENTS.md`,
  `docs/DEVELOPER-GUIDE.md`, `docs/AGENT-SANDBOX.md`.
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
  `node ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs --detect-model-providers`
  returns a JSON array of ids. Pass it as `MODEL_PROVIDER_EXTENSIONS`; the script merges
  it into `VSCODE_EXTENSIONS` so those models are available inside the container.
- Extensions the stack obviously needs (language, linter, formatter) for
  `VSCODE_EXTENSIONS`.
- The skills repository path: `${localEnv:HOME}/.copilot/skills` is mounted read-only
  at `/home/dev/.copilot/skills` and pre-approved for `node` runs. Keep it unless the
  user says the skills live elsewhere; ask only when that host path does not exist.

Record the derivation notes in `docs/AGENT-SANDBOX.md` under *Assumptions*.

### 3. Fill the values file

```bash
node ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs --list-variables
```

Write a JSON object with one value per placeholder; see
[references/template-variables.md](./references/template-variables.md). Keep the
values file outside the repository (for example `<session>/files/sandbox-values.json`).

### 4. Render

```bash
node ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs \
  --dest "<repository root>" \
  --values "<values.json>"
```

The script is deterministic and idempotent: it copies templates, substitutes
placeholders, and appends the snippets only when their markers are absent. Use
`--dry-run` first, `--force` only with user approval.

### 5. Verify

```bash
node ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/verify-sandbox.mjs --dest "<repository root>"
```

Static checks: JSONC parses, no `docker.sock`, no host home or SSH mounts, the
skills repository mounted read-only at `/home/dev/.copilot/skills`, non-root user,
`cap-drop=ALL`, `no-new-privileges`, resource limits, a well-formed
`customizations.vscode.extensions` list, chat-UI autonomy
settings (`chat.permissions.default`, `chat.agent.maxRequests`, terminal auto-approve
map with pattern-based refusals and a `true` pattern for skills node scripts), the
CLI permissions seed in `post-create.sh` (`node:*` plus the skills directory), the
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
- **English only** in every generated file.
- **User-owned Git history.** Never commit or push from the host or the sandbox.

## References

- [Container hardening](./references/container-hardening.md) — every isolation control and why
- [Autonomy flags](./references/autonomy-flags.md) — verified Copilot CLI options for unattended runs
- [Template variables](./references/template-variables.md) — placeholder contract
- [scaffold-sandbox.mjs](./scripts/scaffold-sandbox.mjs) — renderer
- [verify-sandbox.mjs](./scripts/verify-sandbox.mjs) — checks

Both scripts import the shared helpers from `lib/` at the skills repository root, so
run them from a full checkout: `node <skill-root>/scripts/<name>.mjs`.
