# Container Hardening

Every control in the generated sandbox and the risk it addresses. Use this file to
audit a sandbox, or to justify a control to someone who asks why the agent is
"allowed to do anything".

## Threat model

The agent is assumed to be **cooperative but fallible**: it can run any command it
decides to run, and it can be tricked by content it reads (a README, a dependency, an
issue). It is not assumed to be an attacker with host access, and it is not given one.

The assets worth protecting, in order:

1. Host credentials: SSH keys, cloud tokens, `gh` auth, browser sessions.
2. Host files outside the repository.
3. Git history of the repository.
4. Availability of the host (CPU, memory, disk).
5. Secret material inside the repository (`.env` files).

## Controls

| Control | Where | Risk addressed | Residual risk |
|---|---|---|---|
| Non-root user `dev`, no `sudo` in the image | Dockerfile, `remoteUser` | Privilege escalation inside the container | Kernel-level container escape (out of scope, patch Docker) |
| `--cap-drop=ALL` | `runArgs` | Raw sockets, mounts, module loading | None meaningful with `no-new-privileges` |
| `--security-opt=no-new-privileges` | `runArgs` | Setuid binaries raising privileges | None |
| No `docker.sock` | `mounts` | Container escape via the daemon; host-wide control | None |
| Named volumes only | `mounts` | Host home, `~/.ssh`, `~/.aws`, `~/.config/gh` exposure | Volumes persist credentials the agent itself created |
| Bind mount of the project, plus read-only bind of the skills repository | `workspaceMount`, `mounts` | Host filesystem reachability | The worktree is writable by design; the skills mount is host code readable by the agent |
| `--memory`, `--cpus`, `--pids-limit` | `runArgs` | Fork bombs, memory exhaustion, host starvation | Disk is not capped by flags |
| Capless `ping` + `net.ipv4.ping_group_range` | Dockerfile, `runArgs` | No `CAP_NET_RAW` is added back just to diagnose the network | Any container process may send ICMP echo, scoped to the container netns |
| `init: true` | devcontainer.json | Zombie processes over multi-hour runs | None |
| `git-guard.sh` as `/usr/local/bin/git` | Dockerfile | Accidental commits, pushes, history rewrite | Bypassable via `/usr/bin/git`; it is a guardrail |
| No host env passthrough | `containerEnv` only | Leaking tokens through environment variables | Values written into `containerEnv` are visible to the agent |

## The skills mount

`~/.copilot/skills` is the single host directory bind-mounted into the sandbox, at
`/home/dev/.copilot/skills` and read-only. It breaks the "named volumes only" rule on
purpose: the skills are the agent's tooling, the agent must not rewrite the code it
executes, and the directory holds scripts — no credentials, no session state.

- Read-only: a compromised or confused run cannot modify the scripts, and a skill bug
  never becomes a repository change.
- Pre-approved for execution: `node` runs of a script under a `skills/` directory are
  approved in the chat UI, and `post-create.sh` seeds the CLI
  `permissions-config.json` with `node:*` and the skills directory. Without this,
  every skill invocation prompts and long runs stall.
- Still bounded: the mount is host data, so treat skill contents as trusted code. A
  skill that reads a secret would read it from the container, not from the host home,
  which stays unmounted.
- Not reachable: `~/.copilot` itself is a named volume; only its `skills/` subtree is
  a bind mount, so `config.json`, `permissions-config.json` (seeded, not mounted), and
  session state stay inside the container.

## Deliberate non-goals

- **Network egress is open.** A default-deny firewall with an allowlist is better for
  hostile-content scenarios; it also breaks legitimate installs and needs
  `--cap-add=NET_ADMIN`, which reopens a privileged capability. Add it when the
  repository processes untrusted content, not by default.
- **Disk quotas are not enforced.** Use the host filesystem quota or a dedicated
  volume with a size limit if runs can generate large artefacts.
- **The worktree is trusted.** Anything the agent writes lands on the host and is
  picked up by the user's editor and tooling. Review diffs before running builds that
  execute repository code on the host.

## Audit checklist

1. `docker inspect` the container: `Privileged=false`, `CapDrop=[ALL]`, no
   `/var/run/docker.sock` mount, `Memory` and `NanoCpus` set, and exactly one bind
   mount besides the workspace — the skills repository, mounted `ro`.
2. `docker exec <container> id` returns a non-zero uid.
3. `docker exec <container> sudo -n true` fails because `sudo` is absent.
4. `docker exec <container> git commit -m x` exits 97.
5. `docker exec <container> env` shows no host token.
6. `docker exec <container> ls /home/dev` shows only volume-backed directories and the
   read-only `skills` mount.
7. `docker exec <container> ping -c 1 127.0.0.1` replies; `docker inspect` shows no
   added capabilities beyond the dropped set.
