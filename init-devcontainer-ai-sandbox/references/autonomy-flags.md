# Autonomy Flags (Copilot CLI)

Options that make an unattended run possible, verified against the GitHub Copilot CLI
command reference. They change; re-check the reference before relying on one.

Reference: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>

## Permission options

| Option | Effect | In-session equivalent |
|---|---|---|
| `--allow-all` | Grant all tool, path, and URL permissions | `/permissions allow-all` |
| `--yolo` | Alias for `--allow-all` | `/yolo [on\|off\|show]` |
| `--allow-all-tools` | Grant tool permissions only | `/permissions allow-all` |
| `--allow-all-paths` | Grant filesystem path permissions only | `/permissions allow-all` |
| `--allow-all-urls` | Grant URL permissions only | `/permissions allow-all` |
| `--no-ask-user` | Disable the `ask_user` tool: the agent never waits for a human | — |
| `--autopilot OBJECTIVE` / `/autopilot [OBJECTIVE]` | Objective-driven autonomous mode | `/goal [OBJECTIVE]` refocuses it |
| `--max-autopilot-continues=COUNT` | Automatic continuations outside an active objective, default 5 | — |

## Session options useful for long runs

| Option | Effect |
|---|---|
| `-p PROMPT`, `--prompt=PROMPT` | Programmatic run; exits when done and prints a `--resume=SESSION-ID` hint |
| `--resume=SESSION-ID`, `--continue` | Continue a previous session |
| `-n NAME`, `--name=NAME` | Name the session so `--resume` can find it |
| `--model=MODEL`, `--model=auto` | Pin the model; `COPILOT_MODEL` also works |
| `--log-dir=DIRECTORY`, `--log-level=LEVEL` | Where the CLI writes its own logs |
| `--max-ai-credits=CREDITS` | Soft per-response credit limit; `/limits` adjusts it mid-session |
| `-s`, `--silent`, `--output-format=json` | Reduce noise; JSONL output for machine consumption |
| `--share=PATH` | Write the session to a Markdown file when a programmatic run ends |
| `--add-dir`, `-C`, `--worktree` | Control the working scope |

## Enterprise policy

Managed Copilot installations can suppress `--allow-all-tools`, `--allow-all-paths`,
`--allow-all-urls`, `--allow-all`, and `--yolo`. The CLI prints a policy warning and
keeps requiring approval; `/permissions allow-all` is refused too. In that case the
run cannot be unattended, whatever the container does — escalate to the administrator
rather than working around the policy.

`COPILOT_ASSISTED_APPROVAL` is a separate, non-interactive approval mode: it approves
eligible permission requests for `-p` runs without granting everything. It takes
precedence over `--allow-all-tools` but does not affect paths or URLs. It is a middle
ground when the allow-all flags are suppressed.

## Recommended invocation

```bash
copilot \
  --allow-all \
  --no-ask-user \
  --max-autopilot-continues=50 \
  --log-dir .agent/logs \
  -p "$(cat .agent/goal.md)"
```

Exit status is non-zero when the run is interrupted; the printed session id resumes
it with `--resume`. `scripts/run.sh` in the sandbox builds exactly this command and
adds logging, detach, and timeout.

## Authenticating in a container

- Run `copilot` once interactively and complete the device flow; the credentials live
  in `COPILOT_HOME` (`/home/dev/.copilot` by default), which the sandbox keeps in a
  named volume.
- Never bind-mount the host `~/.copilot`, and never copy host tokens into the image.
- The sandbox has no keyring; if the CLI asks for a credential store, prefer the
  file-based store inside `COPILOT_HOME`.
