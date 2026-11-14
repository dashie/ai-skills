# AI skills

A collection of skills for GitHub Copilot: project setup, an AI development
sandbox, and a spec-driven workflow.

## Requirements

- Git and GitHub Copilot CLI or VS Code with GitHub Copilot.
- Python 3.9 or later, available as `python3` in the same environment as the
  agent. The helper scripts use the Python standard library; no `pip install`
  or virtual environment is required.
- For the sandbox skill: Docker and VS Code with the Dev Containers extension.

Check Python in a terminal:

```sh
python3 --version
```

### Install Python

- **macOS:** install Python 3 from [python.org](https://www.python.org/downloads/)
  or with Homebrew: `brew install python`.
- **Linux:** install Python 3 using your distribution's package manager, for
  example `sudo apt install python3` on Debian or Ubuntu.
- **Windows:** use [WSL](https://learn.microsoft.com/windows/wsl/install) with
  a Linux distribution. Install Python inside that distribution, then run
  Copilot CLI there or open the project in VS Code through WSL. The skills'
  commands use `python3` and Unix-style paths; native PowerShell is not the
  documented setup.

Run `python3 --version` again after installation. If it is older than 3.9,
install a newer version and ensure `python3` resolves to it.

## Install the skills

The skills use `~/.copilot/skills` as their user-level location. On Windows,
the following commands run inside WSL, not PowerShell.

If that directory does **not** already exist, clone this repository into it:

```sh
mkdir -p ~/.copilot
git clone <repository-url> ~/.copilot/skills
```

Replace `<repository-url>` with the URL of your accessible copy of this
repository. If `~/.copilot/skills` already exists, do not clone over it: copy
the skill directories from a separate clone into it, preserving any existing
skills. Check for name conflicts before copying. Keep all five `spec-*`
directories together because they reference one another.

To confirm that the scripts are available, run:

```sh
python3 ~/.copilot/skills/init-ai-ready-project/scripts/scaffold.py --list-variables
python3 ~/.copilot/skills/spec-workflow/scripts/spec_plan.py --help
```

Both commands should print information and exit successfully. Restart the
Copilot session if newly installed skills do not appear.

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
`git pull` from that directory after checking for local changes. If you copied
the directories from another checkout, update the checkout and copy the changed
skill directories again, taking care not to overwrite local changes.

Each skill's `SKILL.md` contains its detailed instructions and links to its
references.
