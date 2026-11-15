# AI skills

A collection of skills for GitHub Copilot: project setup, an AI development
sandbox, and a spec-driven workflow.

## Requirements

- Git and GitHub Copilot CLI or VS Code with GitHub Copilot.
- Node.js 22 or later, available as `node` in the same environment as the
  agent. The helper scripts use only the Node.js standard library: the
  repository has no runtime dependencies, so `npm install` is not required to
  run them and no global package is installed.
- For the sandbox skill: Docker and VS Code with the Dev Containers extension.

Check Node.js in a terminal:

```sh
node --version
```

### Install Node.js

- **macOS:** install Node.js 22 from [nodejs.org](https://nodejs.org/) or with
  Homebrew: `brew install node`.
- **Linux:** install Node.js 22 using your distribution's package manager or a
  version manager such as `nvm` or `fnm`.
- **Windows:** Node.js installs natively, so Copilot CLI, VS Code and the
  skills work in PowerShell; no WSL is required.

Run `node --version` again after installation. If it is older than 22, install
a newer version and ensure `node` resolves to it.

## Install the skills

The skills use `~/.copilot/skills` as their user-level location.

If that directory does **not** already exist, clone this repository into it:

```sh
mkdir -p ~/.copilot
git clone <repository-url> ~/.copilot/skills
```

Replace `<repository-url>` with the URL of your accessible copy of this
repository. If `~/.copilot/skills` already exists, do not clone over it: copy
the skill directories from a separate clone into it, preserving any existing
skills. Check for name conflicts before copying. Keep all five `spec-*`
directories together because they reference one another, and always copy the
`lib/` directory alongside the skill directories: every script imports the
shared library from there.

To confirm that the scripts are available, run:

```sh
~/.copilot/skills/bin/aispec scaffold --list-variables
~/.copilot/skills/bin/aispec plan --help
```

Both commands should print information and exit successfully. Restart the
Copilot session if newly installed skills do not appear.

## Run the scripts

The scripts run with `node` and need no installation step. `package.json` is
only a convenience layer: it declares the required Node.js version and exposes
the commands as `bin` entries, so `npm link` installs them on your `PATH` —
`aispec` is the one the skills call:

```sh
npm link     # optional: exposes the commands below
npm run smoke
```

| Command | Script |
|---|---|
| `aispec` | `bin/aispec` (dispatcher for every command below) |
| `skill-scaffold` | `init-ai-ready-project/scripts/scaffold.mjs` |
| `skill-update` | `init-ai-ready-project/scripts/update.mjs` |
| `skill-check-output` | `init-ai-ready-project/scripts/check-output.mjs` |
| `sandbox-scaffold` | `init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs` |
| `sandbox-verify` | `init-devcontainer-ai-sandbox/scripts/verify-sandbox.mjs` |
| `sandbox-uninstall` | `init-devcontainer-ai-sandbox/scripts/uninstall-sandbox.mjs` |
| `spec-plan` | `spec-workflow/scripts/spec-plan.mjs` |
| `skill-allow` | `scripts/allow-skills.mjs` |

Without `npm link`, `~/.copilot/skills/bin/aispec <verb>` works with the
absolute path, and `node <path>` still runs any script directly — but the
permission approval grants `aispec` only, so a direct `node` call asks again.

`npm run smoke` (or `node scripts/smoke.mjs`) renders every scaffold into a
temporary directory and verifies the result, so it proves the checkout is
healthy without touching your project. It needs no network and no Docker.

## Use the skills

Open the project you want to work on in Copilot CLI or VS Code, and describe
your request in chat. You can name a skill explicitly, for example:

| Skill | Example request |
|---|---|
| `init-ai-ready-project` | “Use init-ai-ready-project to set up documentation for this project.” |
| `init-devcontainer-ai-sandbox` | “Use init-devcontainer-ai-sandbox to set up an agent sandbox.” |
| `spec-workflow` | “Use spec-workflow to show the open plans.” |
| `spec-plan` | “Use spec-plan to plan this feature.” |
| `spec-implement` | “Use spec-implement to execute plan 001.” |
| `spec-review` | “Use spec-review to review plan 001.” |
| `spec-close` | “Use spec-close to close plan 001.” |

The spec workflow runs in order: **plan → implement → review → close**. Each
phase stops and tells you what to do next; review can send work back to
implementation, and corrects the documentation the change made stale.

## One command for every skill

`bin/aispec` dispatches to the scripts, so a single permission rule covers them all:

```sh
aispec plan list          # spec-workflow/scripts/spec-plan.mjs
aispec scaffold ...       # init-ai-ready-project/scripts/scaffold.mjs
aispec update ...         # init-ai-ready-project/scripts/update.mjs
aispec check ...          # init-ai-ready-project/scripts/check-output.mjs
aispec allow ...          # scripts/allow-skills.mjs
aispec sandbox-scaffold | sandbox-verify | sandbox-uninstall ...
```

`aispec <verb> --help` prints the verb's own options. Put it on `PATH` once:

```sh
npm link                  # from ~/.copilot/skills, exposes `aispec`
# or: export PATH="$HOME/.copilot/skills/bin:$PATH"
```

Without it, `~/.copilot/skills/bin/aispec plan list` works with the absolute path, and
`node ~/.copilot/skills/spec-workflow/scripts/spec-plan.mjs list` keeps working as
documented in each `SKILL.md`. The dispatcher is a plain node script with no
dependencies.

## Run the skills without approval prompts

The skills execute scripts that live outside the project you are working in, so the
agent asks before running them. Copilot stores that approval per location, in
`~/.copilot/permissions-config.json`; you can also write it up front instead of
answering the prompt each time:

```sh
cd /path/to/your-repo
aispec allow
```

It approves the `aispec` command (`aispec:*`) and adds the skills directory to
`allowed_directories` for that repository. It merges, never replaces: other locations
and other approvals are left alone, and running it twice changes nothing. An older
`node:*` entry in the same location is dropped, because approving `node` approves every
node script — `aispec` reaches only the skill scripts.

- The location is the repository root, so a worktree is approved by approving
  its main checkout. A directory outside a Git repository is keyed by its own
  path.
- Run it once per repository where you use the skills. To skip that step, start
  the session and approve `aispec` for the repository when the first prompt
  appears: Copilot writes the same entry.
- `--dir <path>` approves another directory, `--remove` takes the approvals
  back, `--dry-run` prints the result without writing, and `--config <file>`
  targets a different configuration file.
- The approval covers `aispec` and read access to the skills directory only;
  every other command keeps its normal policy. Calling the scripts through
  `node` directly needs its own approval.
- `init-ai-ready-project` records the same approval for the repository it
  scaffolds, so a new project needs no extra step. Its `--no-allow-skills` flag
  skips that write.

Saved approvals apply to interactive sessions. Non-interactive runs
(`copilot -p`) ignore them and deny anything that would prompt, so pass the
equivalent flags instead:

```sh
copilot -p "..." --allow-tool 'shell(aispec:*)' --add-dir ~/.copilot/skills
```

## Updating

If you cloned directly into `~/.copilot/skills`, update that checkout with
`git pull` from that directory after checking for local changes: a pull brings
`lib/`, `package.json` and every skill together, which is the supported layout.

If you copied the directories from another checkout, update the checkout and
copy the changed skill directories **and `lib/`** again, taking care not to
overwrite local changes. A `lib/` that lags behind the scripts breaks them at
startup with `ERR_MODULE_NOT_FOUND`.

After updating, run `npm run smoke` to confirm the checkout is coherent.

Each skill's `SKILL.md` contains its detailed instructions and links to its
references.
