# Template Variables

`scripts/scaffold_sandbox.py` renders the templates. Run
`python3 scripts/scaffold_sandbox.py --list-variables` to print this contract from
the templates themselves.

## Rules

- One key per placeholder, values are strings; arrays of strings are joined with
  newlines.
- Empty or whitespace-only values are rejected.
- Never place `{{` inside a value.
- Unknown keys warn, missing keys abort.
- JSON-valued keys (`VSCODE_EXTENSIONS`, `FORWARD_PORTS`) are inserted verbatim into
  `devcontainer.json`: write valid JSON array text, for example
  `["ms-python.python", "ms-python.vscode-pylance"]` and `[8000, 5432]`.

## Keys

| Placeholder | Used in | Content |
|---|---|---|
| `PROJECT_NAME` | devcontainer.json, Dockerfile, stack-tools.sh, post-create.sh, goal.md, docs | Human-readable project name |
| `PROJECT_SLUG` | devcontainer.json, docs | Lowercase identifier for volume prefixes: `[a-z0-9-]+` |
| `BASE_IMAGE` | devcontainer.json, Dockerfile | Official dev-container image tag for the stack, e.g. `mcr.microsoft.com/devcontainers/python:3.12` |
| `COPILOT_CLI_VERSION` | Dockerfile | Version of `@github/copilot` to install, e.g. `1.0.0` or `latest` |
| `STACK_TOOLS` | stack-tools.sh | Shell commands, without shebang, that install the stack tooling at build time |
| `POST_CREATE_EXTRA` | post-create.sh | Shell commands run once after creation (dependency install, migrations), or `echo "nothing to set up"` |
| `VSCODE_EXTENSIONS` | devcontainer.json | JSON array of extension ids |
| `FORWARD_PORTS` | devcontainer.json | JSON array of ports |
| `MEMORY_LIMIT` | devcontainer.json, docs | Docker memory limit, e.g. `8g` |
| `CPU_LIMIT` | devcontainer.json, docs | Docker CPU limit, e.g. `4` |
| `SANDBOX_ASSUMPTIONS` | docs | Derivation notes and open questions, or `None recorded.` |

## Example

```json
{
  "PROJECT_NAME": "netwatch",
  "PROJECT_SLUG": "netwatch",
  "BASE_IMAGE": "mcr.microsoft.com/devcontainers/python:3.12",
  "COPILOT_CLI_VERSION": "latest",
  "STACK_TOOLS": "python3 -m pip install --no-cache-dir --upgrade pip\npip install uv",
  "POST_CREATE_EXTRA": "uv sync --frozen || echo \"no lockfile yet\"",
  "VSCODE_EXTENSIONS": "[\"ms-python.python\", \"ms-python.vscode-pylance\", \"charliermarsh.ruff\"]",
  "FORWARD_PORTS": "[8000]",
  "MEMORY_LIMIT": "8g",
  "CPU_LIMIT": "4",
  "SANDBOX_ASSUMPTIONS": "- Python 3.12 assumed from `pyproject.toml`.\n- Port 8000 assumed from the API default."
}
```

## Derivation hints

| Signal | `BASE_IMAGE` | Default `STACK_TOOLS` |
|---|---|---|
| `package.json` | `mcr.microsoft.com/devcontainers/javascript-node:22` | none (corepack ships with the image) |
| `pyproject.toml` / `requirements.txt` | `mcr.microsoft.com/devcontainers/python:3.12` | `pip install --no-cache-dir uv` |
| `go.mod` | `mcr.microsoft.com/devcontainers/go:1.22` | none |
| `Cargo.toml` | `mcr.microsoft.com/devcontainers/rust:1` | none |
| `pom.xml` / `build.gradle` | `mcr.microsoft.com/devcontainers/java:21` | none |
| `*.csproj` | `mcr.microsoft.com/devcontainers/dotnet:9.0` | none |
| nothing detectable | `mcr.microsoft.com/devcontainers/base:ubuntu-24.04` | install only what the task needs |

Keep `MEMORY_LIMIT` and `CPU_LIMIT` at or below the host capacity; the build itself
needs headroom on top of the runtime limit.
