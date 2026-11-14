<!-- BEGIN agent-sandbox -->

## AI sandbox

Long autonomous agent runs happen inside the dev-container, never on the host.

```bash
# VS Code: Dev Containers: Reopen in Container
# inside the container:
copilot                        # one-time authentication, persisted in a volume
bash .agent/run.sh --dry-run   # inspect the launcher arguments
bash .agent/run.sh --detach    # unattended run, logged and resumable
tmux attach -t agent
tail -f .agent/logs/*.log
```

The container uses a non-root user, mounts no Docker socket, no host home, and no
credentials, drops all capabilities, and limits CPU, memory, and PIDs. The only host
bind mounts are the worktree and the read-only skills repository at
`/home/dev/.copilot/skills`, so the agent runs skill scripts without a prompt. Git is
read-only: the image ships a `git` guard that refuses history-changing subcommands,
so the agent prepares the change and the user commits on the host.

Details: [AGENT-SANDBOX.md](./AGENT-SANDBOX.md).

<!-- END agent-sandbox -->
