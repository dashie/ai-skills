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
| Bind mount of the project only | `workspaceMount` | Host filesystem reachability | The worktree is writable by design |
| `--memory`, `--cpus`, `--pids-limit` | `runArgs` | Fork bombs, memory exhaustion, host starvation | Disk is not capped by flags |
| `init: true` | devcontainer.json | Zombie processes over multi-hour runs | None |
| `git-guard.sh` as `/usr/local/bin/git` | Dockerfile | Accidental commits, pushes, history rewrite | Bypassable via `/usr/bin/git`; it is a guardrail |
| No host env passthrough | `containerEnv` only | Leaking tokens through environment variables | Values written into `containerEnv` are visible to the agent |

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
   `/var/run/docker.sock` mount, `Memory` and `NanoCpus` set.
2. `docker exec <container> id` returns a non-zero uid.
3. `docker exec <container> sudo -n true` fails because `sudo` is absent.
4. `docker exec <container> git commit -m x` exits 97.
5. `docker exec <container> env` shows no host token.
6. `docker exec <container> ls /home/dev` shows only volume-backed directories.
