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
node ~/.copilot/skills/init-ai-ready-project/scripts/scaffold.mjs --list-variables
node ~/.copilot/skills/spec-workflow/scripts/spec-plan.mjs --help
```

Both commands should print information and exit successfully. Restart the
Copilot session if newly installed skills do not appear.

## Run the scripts

The scripts run with `node` and need no installation step. `package.json` is
only a convenience layer: it declares the required Node.js version and exposes
the commands as `bin` entries, so `npm link` installs them on your `PATH`:

```sh
npm link     # optional: exposes the commands below
npm run smoke
```

| Command | Script |
|---|---|
| `skill-scaffold` | `init-ai-ready-project/scripts/scaffold.mjs` |
| `skill-update` | `init-ai-ready-project/scripts/update.mjs` |
| `skill-check-output` | `init-ai-ready-project/scripts/check-output.mjs` |
| `sandbox-scaffold` | `init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs` |
| `sandbox-verify` | `init-devcontainer-ai-sandbox/scripts/verify-sandbox.mjs` |
| `spec-plan` | `spec-workflow/scripts/spec-plan.mjs` |

Without `npm link`, run any of them with `node <path>`; the skills use exactly
that form.

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
implementation.

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
