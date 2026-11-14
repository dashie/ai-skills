# AI Sandbox — {{PROJECT_NAME}}

How to run an AI agent on this repository for hours, unattended, with full
permissions, without giving it the host.

## Why a container

An agent with all permissions can run any command, read any file it can see, and
write anywhere it can reach. Approving thousands of individual actions does not make
that safe: it makes it slow. A container turns the question from "may the agent do
this?" into "what can the agent reach at all?", and the answer is: this repository,
a disposable filesystem, and the network.

## Isolation model

Guarantees of `.devcontainer/devcontainer.json` and `.devcontainer/Dockerfile`:

| Control | Effect |
|---|---|
| `remoteUser: dev`, no sudo in the image | The agent runs unprivileged and cannot escalate |
| `--cap-drop=ALL` | No Linux capability, including `CAP_SYS_ADMIN` |
| `--security-opt=no-new-privileges` | Setuid binaries cannot raise privileges |
| No `docker.sock` mount | The agent cannot start containers or reach the host daemon |
| Named volumes only for `~/.copilot`, `~/.npm`, `~/.cache`, `~/.local` | No host home directory, no `~/.ssh`, no `~/.aws`, no host dotfiles |
| Bind mount of the project, plus a read-only bind of the skills repository | The only host data reachable is the worktree and the agent tooling |
| `--memory={{MEMORY_LIMIT}}`, `--cpus={{CPU_LIMIT}}`, `--pids-limit=2048` | A runaway process cannot starve the host |
| Capless `ping` plus `net.ipv4.ping_group_range` | Network diagnosis works without adding `CAP_NET_RAW` back |
| `init: true` | Zombie processes are reaped during multi-hour runs |
| Read-only Git shim | `commit`, `push`, `tag`, `merge`, `rebase`, `reset`, `clean`, `cherry-pick`, `revert` are refused |

Not guaranteed:

- **Network egress is open.** The agent can reach any host, including package
  registries and the model API. Anything it downloads is trusted by default. See
  *Hardening further* below.
- **The project is writable.** The worktree is the blast radius; a bad change is
  recoverable only because the files live on the host, not inside the container.
- **The Git guard is a guardrail.** A determined agent can call `/usr/bin/git`
  directly. It stops accidents, not attacks; the container stops attacks.

## Layout

```
.devcontainer/
  devcontainer.json     container definition, mounts, limits
  Dockerfile            base image, tooling, Copilot CLI, non-root user
  stack-tools.sh        stack-specific tooling, run at build time
  post-create.sh        first-run setup, git identity, checks
  git-guard.sh          installed in the image as /usr/local/bin/git
.agent/
  goal.md               objective of the next unattended run
  run.sh                launcher: logging, detach, timeout, resume
  logs/                 one log per run (git-ignored)
```

## First run

1. Open the repository in VS Code and run **Dev Containers: Reopen in Container**.
   The image is built once; later rebuilds reuse the layer cache.
2. In the container terminal, authenticate the CLI once:

   ```bash
   copilot
   ```

   Complete the device login. Credentials land in the `{{PROJECT_SLUG}}-copilot`
   volume and survive rebuilds. Never copy host credentials into the sandbox.

3. Confirm the sandbox works:

   ```bash
   git --version
   git status
   git commit -m "test"    # must be refused with exit code 97
   ping -c 1 127.0.0.1     # must reply without sudo or extra capabilities
   ```

## Network diagnosis

`ping` is installed in the image on purpose: it is the first thing an agent reaches
for when a dependency install or an API call fails. It runs without `CAP_NET_RAW` and
without `sudo`:

- the image removes the binary's file capability (`setcap -r /usr/bin/ping`), so it
  can be executed at all under `--cap-drop=ALL`;
- `--sysctl=net.ipv4.ping_group_range=0 2147483647` lets it use unprivileged ICMP
  datagram sockets inside the container's network namespace.

`ping` therefore proves reachability only: it says nothing about whether a port is
open. Use `curl` for that (`curl` stays approval-gated in the chat UI).

## Long unattended run

```bash
# 1. write the objective
$EDITOR .agent/goal.md

# 2. start detached, logged, resumable
bash .agent/run.sh --detach --session agent-1

# 3. follow the work
tmux attach -t agent-1
tail -f .agent/logs/*.log
```

With a wall-clock guard and a model pinned:

```bash
bash .agent/run.sh --timeout 14400 --model claude-sonnet-5.5
```

Resume an interrupted session:

```bash
bash .agent/run.sh --resume <session-id>
```

Inspect the command without running it:

```bash
bash .agent/run.sh --dry-run
```

## Skills tooling

The agent runs its automation from the skills repository, and asking for approval on
every script invocation stops a long run. The sandbox therefore mounts that repository
into the container and pre-approves it on both surfaces.

```
host:      ~/.copilot/skills
container: /home/dev/.copilot/skills   (bind mount, read-only)
```

- **Read-only on purpose.** The skills are tooling, not project code: the agent must
  not rewrite the scripts it is executing, and a broken skill must not become a
  committed change.
- **Chat UI.** `chat.tools.terminal.autoApprove` in `devcontainer.json` approves
  `node` invocations of a script under a `skills/` directory:
  `/^node\s+\S*\/skills\/\S+\.(mjs|js)(\s|$)/`. Other `node` commands still follow
  the general policy.
- **CLI.** `.devcontainer/post-create.sh` seeds
  `$COPILOT_HOME/permissions-config.json` on first creation with `node:*` command
  approvals for `/workspace` and `/home/dev/.copilot/skills` in
  `allowed_directories`. `--allow-all` in `.agent/run.sh` covers the rest of the run.
- **Not pre-approved.** `rm`, `curl`, `wget`, `kill`, `chmod`, `chown`, and every
  Git history command, exactly as before. The skills mount changes nothing about the
  Git guard.

If the skills repository lives somewhere else on the host, change the `source` of the
`/home/dev/.copilot/skills` mount in `.devcontainer/devcontainer.json`. If there is
nothing to mount, the container still works; `post-create.sh` only prints a note.

## Autonomy options

Autonomy depends on **how** the agent is invoked: the chat UI and the CLI have
separate permission systems. Both are pre-configured by this sandbox.

### Chat UI (VS Code)

The Copilot Chat extension is a workspace extension, so in a Remote-Containers window
its extension host runs **inside** the container: terminal tools and file edits act on
the sandboxed filesystem. Its permissions come from VS Code settings, not CLI flags,
and `.devcontainer/devcontainer.json` sets them in `customizations.vscode.settings`:

| Setting | Value | Why |
|---|---|---|
| `chat.permissions.default` | `autoApprove` | New sessions start without asking for every tool || `chat.agent.maxRequests` | `300` | The default (25) stops long runs early |
| `chat.tools.terminal.enableAutoApprove` | `true` | Terminal commands run without confirmation |
| `chat.tools.terminal.autoApprove` | map with `true` for `node` runs of a script under `skills/`, and `false` for `rm`, `curl`, `wget`, `kill`, `chmod`, `chown`, plus a regex blocking `git commit/push/tag/merge/rebase/reset/clean` | Skills scripts and ordinary work run; destructive and history-changing commands still ask |
| `git.enableCommitSigning` | `false` | No signing key exists in the sandbox |

`chat.tools.global.autoApprove: true` would approve everything at once; it explicitly
*disables critical security protections*, so it is not used. `chat.permissions.default`
is overridden to manual by enterprise policy that disables auto-approval.

The Claude and Codex harnesses are not covered by these settings: they keep their own
provider permissions, and `--dangerously-skip-permissions` (Claude) or equivalent must
be passed by you, not pre-configured here.

### Third-party model providers

Copilot Chat lists the models that its **container-side** extension host registers. An
extension that contributes `languageModelChatProviders` (BYOK providers such as
DeepSeek or OpenRouter bridges) registers them from the extension host where it runs,
so installing it only on the host machine is not enough: in a Remote-Containers window
it runs on the local side and its models never reach the picker.

Install it in the container by listing its id in `customizations.vscode.extensions` of
`.devcontainer/devcontainer.json`, then rebuilding the container. Extensions detected
on the host at generation time are already listed there.

API keys live in VS Code `SecretStorage`, which is per extension host: a key saved on
the host is not visible inside the container. Run the provider's setup command (for
example *DeepSeek: Set API Key*) from the container window.

The provider endpoint must be reachable from the container — open egress is the
default, so add it to any allowlist you introduce later. Providers that ship no browser
entry point cannot run in the web extension host and stay unavailable in browser-only
sessions.

Confirm the container-side install:

```bash
code --list-extensions --show-versions
```

### CLI

`.agent/run.sh` passes these to the Copilot CLI. They are the reason the run needs no
approval:

| Option | Meaning |
|---|---|
| `--allow-all` | Grant every tool, path, and URL permission (alias `--yolo`; also `/permissions allow-all` in session) |
| `--no-ask-user` | Disable the `ask_user` tool, so the agent never waits for a human |
| `--max-autopilot-continues=N` | How many times the agent may continue by itself outside an explicit objective |
| `-p PROMPT` | Programmatic run; exits when the objective completes and prints a resume hint |
| `--log-dir` | Where the CLI writes its own logs, next to the run log |
| `--model` | Pin the model for reproducibility |
| `--resume` | Continue a previous session id |

In an interactive session the equivalents are `/permissions allow-all`,
`/yolo`, and `/autopilot <objective>`; `/limits` shows and adjusts usage limits.

**Enterprise policy:** managed Copilot installations can suppress the allow-all flags
(`--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`, `--allow-all`,
`--yolo`). The CLI prints a policy warning and keeps asking for permission. If that
happens, the sandbox still isolates the work, but long unattended runs are not
possible until the policy is changed.

## Git policy

The agent never commits or pushes. `.devcontainer/git-guard.sh` is installed as
`/usr/local/bin/git` and refuses history-changing commands with exit code 97.

The user commits on the host, after reviewing the diff:

```bash
git -C . diff --stat
git -C . add -p
git -C . commit -m "feat(scope): concise subject"
```

If a run must produce a checkpoint before the user is available, snapshot the
worktree instead of touching Git:

```bash
tar -czf /tmp/checkpoint-$(date -u +%Y%m%dT%H%M%SZ).tgz --exclude .git .
```

## Operating limits

- **Quota:** every run consumes Copilot quota. `--max-ai-credits` and `/limits` cap
  a response; long runs still add up.
- **Time:** `--timeout` sends `SIGINT`, then `SIGKILL` after 60 seconds. A clean stop
  is resumable; a killed one loses the in-flight turn only.
- **Disk:** the container can fill the host disk through the bind mount and the
  volumes. Watch `.agent/logs/` and the build cache (`docker system df`).
- **State:** the container is disposable. Anything worth keeping must be a file in
  the repository (uncommitted is fine) or in a named volume.

## Recovery

| Symptom | Action |
|---|---|
| Run stopped early | `bash .agent/run.sh --resume <session-id>` |
| Container wedged | Rebuild: **Dev Containers: Rebuild Container** |
| Disk full | `docker system prune`, remove old `.agent/logs/*.log` |
| Agent loops on the same error | Lower `--max-autopilot-continues`, tighten `.agent/goal.md` |
| Auth lost after rebuild | Volume removed: run `copilot` again |

## Hardening further

- **Egress allowlist.** Add an `init-firewall.sh` that sets the default policy to
  `DROP` and allows only the registries and the model endpoints you use, run it with
  `--cap-add=NET_ADMIN` (which reopens a privileged capability; weigh the trade-off).
- **No network at all.** `"runArgs": ["--network=none"]` for refactoring-only work.
- **Digest pinning.** Replace the tag in `BASE_IMAGE` with a `@sha256:` digest.
- **Separate user per project.** Distinct volume prefixes keep caches and credentials
  from bleeding between repositories.
- **Native alternative.** Copilot CLI also ships local sandboxing; it is lighter than
  a dev-container and a reasonable choice for short, single-purpose runs.

## Assumptions

{{SANDBOX_ASSUMPTIONS}}

## References

- Copilot CLI command reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- Development containers specification: https://containers.dev
- Docker security defaults: https://docs.docker.com/engine/security/
