#!/usr/bin/env bash
# One-time container setup for the {{PROJECT_NAME}} AI sandbox.
# Runs as the non-root user after the container is created.
set -euo pipefail

echo "==> AI sandbox setup for {{PROJECT_NAME}}"

copilot_home="${COPILOT_HOME:-$HOME/.copilot}"
skills_dir="${copilot_home}/skills"
permissions_config="${copilot_home}/permissions-config.json"

# Git identity lives only in this container; no host gitconfig is mounted.
git config --global user.name "${SANDBOX_GIT_NAME:-AI Sandbox}"
git config --global user.email "${SANDBOX_GIT_EMAIL:-ai-sandbox@localhost}"
git config --global init.defaultBranch main
git config --global core.pager cat
git config --global advice.detachedHead false

if ! git config --global --get-all safe.directory | grep -qx "/workspace"; then
  git config --global --add safe.directory /workspace
fi

{{POST_CREATE_EXTRA}}

echo "==> toolchain"
git --version || true
node --version || true
npm --version || true
copilot --version || true

if [ -d "$skills_dir" ]; then
  echo "==> skills available at $skills_dir (read-only)"
else
  cat <<EOF

==> No skills directory at $skills_dir.
    Mount your skills repository there to let the agent run its scripts; the mount
    is defined in .devcontainer/devcontainer.json.
EOF
fi

# The skills repository is mounted read-only at $skills_dir. The CLI pre-approves
# the `aispec` dispatcher and read access to that directory, so an unattended run
# does not stop on a command or path prompt; the same allowance is set for the chat
# UI in devcontainer.json. An existing file is never rewritten.
if [ ! -f "$permissions_config" ]; then
  cat > "$permissions_config" <<EOF
{
  "locations": {
    "/workspace": {
      "tool_approvals": [
        {
          "kind": "commands",
          "commandIdentifiers": ["aispec:*"]
        }
      ],
      "allowed_directories": ["$skills_dir"]
    }
  }
}
EOF
  echo "==> pre-approved aispec and $skills_dir in $permissions_config"
else
  echo "==> keeping the existing $permissions_config"
fi

if [ ! -f "${copilot_home}/config.json" ]; then
  cat <<'EOF'

==> GitHub Copilot CLI is not authenticated in this container yet.
    Run `copilot` once and complete the device login. Credentials are stored in the
    ${COPILOT_HOME} named volume and survive rebuilds. Never copy host credentials
    into the sandbox.
EOF
fi

cat <<'EOF'

==> Sandbox ready.
    Git history is read-only: `git commit`, `git push`, `git tag`, `git merge`,
    `git rebase`, `git reset` and `git clean` are refused by /usr/local/bin/git.
    Long unattended runs: bash .agent/run.sh --detach
    Details: docs/agent-sandbox.md

EOF
