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
| `.devcontainer/devcontainer.json` | Container definition, mounts, limits, chat-UI autonomy settings |
| `.devcontainer/Dockerfile` | Base image, tooling, Copilot CLI (`@github/copilot`), non-root user, sudo purge |
| `.devcontainer/stack-tools.sh` | Stack-specific build steps as plain shell, run at image build |
| `.devcontainer/post-create.sh` | One-time setup: git identity, safe.directory, checks |
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

Derive everything else and record it in `docs/AGENT-SANDBOX.md` under *Assumptions*.

### 3. Fill the values file

```bash
python3 ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/scaffold_sandbox.py --list-variables
```

Write a JSON object with one value per placeholder; see
[references/template-variables.md](./references/template-variables.md). Keep the
values file outside the repository (for example `<session>/files/sandbox-values.json`).

### 4. Render

```bash
python3 ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/scaffold_sandbox.py \
  --dest "<repository root>" \
  --values "<values.json>"
```

The script is deterministic and idempotent: it copies templates, substitutes
placeholders, and appends the snippets only when their markers are absent. Use
`--dry-run` first, `--force` only with user approval.

### 5. Verify

```bash
python3 ~/.copilot/skills/init-devcontainer-ai-sandbox/scripts/verify_sandbox.py --dest "<repository root>"
```

Static checks: JSONC parses, no `docker.sock`, no host home or SSH mounts,
non-root user, `cap-drop=ALL`, `no-new-privileges`, resource limits, chat-UI autonomy
settings (`chat.permissions.default`, `chat.agent.maxRequests`, terminal auto-approve
map with pattern-based refusals), the `git` shim is installed in the Dockerfile, the
launcher is executable, the doc sections exist.

Then, with user approval, run the real build once:

```bash
docker build -t <project>-sandbox -f .devcontainer/Dockerfile .devcontainer
docker run --rm <project>-sandbox id -u            # must not be 0
docker run --rm <project>-sandbox git commit -m x  # must exit 97
docker run --rm <project>-sandbox sh -c 'command -v sudo'  # must find nothing
```

`verify_sandbox.py --docker-build` runs exactly these checks. A sandbox that has
never been built is not verified.

### 6. Report

List the files created or updated, the isolation measures, the exact commands to
start a long unattended run, and the remaining risks (open egress, model provider
outage, quota exhaustion). Do not commit or push anything: the user owns Git history.

## Hard Rules

- **Never mount the Docker socket, the host home, `~/.ssh`, `~/.aws`, `~/.config/gh`,
  or any host credential directory into the sandbox.** Named volumes only.
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
- [scaffold_sandbox.py](./scripts/scaffold_sandbox.py) — renderer
- [verify_sandbox.py](./scripts/verify_sandbox.py) — checks
