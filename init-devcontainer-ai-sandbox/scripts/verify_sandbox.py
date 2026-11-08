#!/usr/bin/env python3
"""Verify the rendered AI sandbox.

Static checks always run. `--docker-build` additionally builds the image and proves
the runtime properties (non-root user, refused commits, CLI present).
"""

import argparse
import json
import os
import re
import subprocess
import sys

REQUIRED_FILES = [
    ".devcontainer/devcontainer.json",
    ".devcontainer/Dockerfile",
    ".devcontainer/stack-tools.sh",
    ".devcontainer/post-create.sh",
    ".devcontainer/git-guard.sh",
    ".agent/run.sh",
    ".agent/goal.md",
    "docs/AGENT-SANDBOX.md",
]

FORBIDDEN_MOUNTS = ["docker.sock", "/.ssh", "/.aws", "/.config/gh", "$HOME", "localEnv:HOME"]
PLACEHOLDER = re.compile(r"\{\{[A-Z0-9_]+\}\}")
COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)
COMMENT_LINE = re.compile(r"^\s*//.*$", re.M)


def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def strip_jsonc(text):
    return COMMENT_LINE.sub("", COMMENT_BLOCK.sub("", text))


def parse_mounts(entry):
    parts = {}
    for chunk in entry.split(","):
        if "=" in chunk:
            key, value = chunk.split("=", 1)
            parts[key.strip()] = value.strip()
    return parts


def static_checks(root):
    problems = []

    for name in REQUIRED_FILES:
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            problems.append("missing file: %s" % name)
        elif os.path.getsize(path) == 0:
            problems.append("empty file: %s" % name)

    devcontainer_path = os.path.join(root, ".devcontainer/devcontainer.json")
    devcontainer = {}
    if os.path.isfile(devcontainer_path):
        raw = read(devcontainer_path)
        leftover = PLACEHOLDER.findall(raw)
        if leftover:
            problems.append("unresolved placeholders in devcontainer.json: %s" % ", ".join(sorted(set(leftover))))
        try:
            devcontainer = json.loads(strip_jsonc(raw))
        except ValueError as error:
            problems.append("devcontainer.json is not valid JSONC: %s" % error)

    if devcontainer:
        if devcontainer.get("remoteUser") != "dev" or devcontainer.get("containerUser") != "dev":
            problems.append("devcontainer.json must run as the non-root user 'dev'")
        if devcontainer.get("privileged"):
            problems.append("devcontainer.json must not be privileged")

        mounts = devcontainer.get("mounts", [])
        for entry in mounts:
            parsed = parse_mounts(entry)
            if parsed.get("type") != "volume":
                problems.append("mount is not a named volume: %s" % entry)
            for forbidden in FORBIDDEN_MOUNTS:
                if forbidden in entry:
                    problems.append("forbidden mount source %r in %s" % (forbidden, entry))

        workspace_mount = devcontainer.get("workspaceMount", "")
        if "type=bind" not in workspace_mount or "target=/workspace" not in workspace_mount:
            problems.append("workspaceMount must bind the project to /workspace")

        run_args = " ".join(devcontainer.get("runArgs", []))
        for required in ["--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=", "--cpus="]:
            if required not in run_args:
                problems.append("runArgs is missing %s" % required)

        settings = devcontainer.get("customizations", {}).get("vscode", {}).get("settings", {})
        if settings.get("chat.permissions.default") not in ("autoApprove", "autopilot"):
            problems.append("chat.permissions.default must be autoApprove or autopilot for unattended chat runs")
        if int(settings.get("chat.agent.maxRequests", 0)) < 100:
            problems.append("chat.agent.maxRequests is too low for long runs (>= 100)")
        if settings.get("chat.tools.global.autoApprove") is True:
            problems.append("chat.tools.global.autoApprove disables safety checks; use chat.permissions.default instead")
        approve_map = settings.get("chat.tools.terminal.autoApprove", {})
        if not any(key.startswith("/") and value is False for key, value in approve_map.items()):
            problems.append("chat.tools.terminal.autoApprove keeps no pattern-based refusal (git/rm/curl)")
        if "git.enableCommitSigning" in settings and settings["git.enableCommitSigning"] is True:
            problems.append("git.enableCommitSigning must stay false inside the sandbox")

    dockerfile_path = os.path.join(root, ".devcontainer/Dockerfile")
    if os.path.isfile(dockerfile_path):
        dockerfile = read(dockerfile_path)
        if not re.search(r"^USER \S", dockerfile, re.M):
            problems.append("Dockerfile never switches to a non-root USER")
        if not re.search(r"COPY --chown=root:root git-guard\.sh /usr/local/bin/git", dockerfile):
            problems.append("Dockerfile does not install git-guard.sh as /usr/local/bin/git")
        if re.search(r"apt-get install[^\n]*\bsudo\b", dockerfile):
            problems.append("Dockerfile installs sudo; the sandbox must not allow escalation")
        if not re.search(r"purge[^\n]*\bsudo\b", dockerfile):
            problems.append("Dockerfile does not purge sudo, which dev-container base images ship")
        if "userdel" not in dockerfile:
            problems.append("Dockerfile does not free UID 1000 before creating the sandbox user")

    guard_path = os.path.join(root, ".devcontainer/git-guard.sh")
    if os.path.isfile(guard_path):
        guard = read(guard_path)
        for blocked in ["commit", "push", "rebase"]:
            if blocked not in guard:
                problems.append("git-guard.sh does not block %s" % blocked)
        if "exit 97" not in guard:
            problems.append("git-guard.sh does not exit with code 97")

    run_path = os.path.join(root, ".agent/run.sh")
    if os.path.isfile(run_path):
        run_script = read(run_path)
        for flag in ["--allow-all", "--no-ask-user", "--max-autopilot-continues"]:
            if flag not in run_script:
                problems.append("run.sh does not use %s" % flag)
        if not os.access(run_path, os.X_OK):
            problems.append("run.sh is not executable")

    for script in [".devcontainer/post-create.sh", ".devcontainer/stack-tools.sh", ".devcontainer/git-guard.sh"]:
        path = os.path.join(root, script)
        if os.path.isfile(path) and not os.access(path, os.X_OK):
            problems.append("%s is not executable" % script)

    docs_path = os.path.join(root, "docs/AGENT-SANDBOX.md")
    if os.path.isfile(docs_path):
        docs = read(docs_path).lower()
        for needle in ["read-only", "allow-all", "--no-ask-user", "docker.sock"]:
            if needle not in docs:
                problems.append("AGENT-SANDBOX.md does not document %r" % needle)
        leftover = PLACEHOLDER.findall(read(docs_path))
        if leftover:
            problems.append("unresolved placeholders in AGENT-SANDBOX.md: %s" % ", ".join(sorted(set(leftover))))

    agents_path = os.path.join(root, "AGENTS.md")
    if os.path.isfile(agents_path):
        agents = read(agents_path)
        if "<!-- BEGIN agent-sandbox -->" not in agents or "<!-- END agent-sandbox -->" not in agents:
            problems.append("AGENTS.md is missing the agent-sandbox section markers")
        if "read-only" not in agents.lower():
            problems.append("AGENTS.md does not state the read-only Git policy")
    else:
        problems.append("missing file: AGENTS.md")

    gitignore_path = os.path.join(root, ".gitignore")
    if os.path.isfile(gitignore_path) and ".agent/logs/" not in read(gitignore_path):
        problems.append(".gitignore does not ignore .agent/logs/")

    return problems


def run(command):
    completed = subprocess.run(command, capture_output=True, text=True)
    return completed.returncode, (completed.stdout + completed.stderr).strip()


def docker_checks(root, tag):
    problems = []
    context = os.path.join(root, ".devcontainer")
    code, output = run(["docker", "build", "-t", tag, "-f", os.path.join(context, "Dockerfile"), context])
    if code != 0:
        return ["docker build failed:\n" + output[-3000:]]

    code, output = run(["docker", "run", "--rm", tag, "id", "-u"])
    if code != 0 or output.strip() == "0":
        problems.append("container does not run as a non-root user: %s" % output.strip())

    code, output = run(["docker", "run", "--rm", tag, "git", "commit", "-m", "smoke"])
    if code != 97:
        problems.append("git-guard did not refuse 'git commit' (exit %d): %s" % (code, output[-500:]))

    code, output = run(["docker", "run", "--rm", tag, "git", "--version"])
    if code != 0 or "git version" not in output:
        problems.append("the git shim does not delegate to the real git (exit %d): %s" % (code, output[-500:]))

    code, output = run(["docker", "run", "--rm", tag, "sh", "-c", "command -v sudo"])
    if code == 0:
        problems.append("sudo is available in the image: %s" % output.strip())

    code, output = run(["docker", "run", "--rm", tag, "copilot", "--version"])
    if code != 0:
        problems.append("copilot CLI is not available in the image: %s" % output[-500:])

    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(description="Verify the rendered AI sandbox.")
    parser.add_argument("--dest", required=True, help="repository root")
    parser.add_argument("--docker-build", action="store_true", help="build the image and test it")
    parser.add_argument("--tag", default="ai-sandbox-verify", help="image tag for --docker-build")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.dest)
    problems = static_checks(root)

    if args.docker_build and not problems:
        problems.extend(docker_checks(root, args.tag))

    if problems:
        for problem in problems:
            sys.stderr.write("error: %s\n" % problem)
        return 1

    suffix = " (static + docker)" if args.docker_build else " (static)"
    print("sandbox OK%s: %s" % (suffix, root))
    return 0


if __name__ == "__main__":
    sys.exit(main())
