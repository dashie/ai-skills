<!-- BEGIN agent-sandbox -->

## AI sandbox

Development for this project runs inside the Docker dev-container in `.devcontainer/`.
The container is the security boundary: no host home directory, no Docker socket, no
credentials, non-root user, dropped capabilities, bounded resources.

- Work inside the container. Never assume a host path such as `~/.ssh` or
  `~/.aws` exists.
- Git history is read-only. `git commit`, `git push`, `git tag`, `git merge`,
  `git rebase`, `git reset`, `git clean`, `git cherry-pick`, and `git revert` are
  refused by the guard installed in the image. Prepare the change, run the tests, and
  report what changed with a proposed commit message; the user commits on the host.
- Unattended runs are launched with `.agent/run.sh` from the objective in
  `.agent/goal.md`. Never edit `.devcontainer/`, `.agent/run.sh`, or the Git guard to
  gain permissions.
- The network is open. Download only what the task needs and never fetch, write, or
  embed credentials.
- Everything written in this repository is in English.

Threat model, limits, and recovery: [docs/AGENT-SANDBOX.md](./docs/AGENT-SANDBOX.md).

<!-- END agent-sandbox -->
