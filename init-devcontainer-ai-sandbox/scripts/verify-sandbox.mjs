#!/usr/bin/env node
/**
 * Verify the rendered AI sandbox.
 *
 * Static checks always run. `--docker-build` additionally builds the image and proves
 * the runtime properties (non-root user, refused commits, CLI present).
 */

import path from "node:path";
import { spawnSync } from "node:child_process";

import { failUsage, parseArgs } from "../../lib/cli.mjs";
import { fileSize, isExecutable, isFile, readText } from "../../lib/fsx.mjs";
import { PLACEHOLDER_RE, matchAll } from "../../lib/markdown.mjs";
import { writeErr, writeOut } from "../../lib/text.mjs";

const REQUIRED_FILES = [
  ".devcontainer/devcontainer.json",
  ".devcontainer/Dockerfile",
  ".devcontainer/stack-tools.sh",
  ".devcontainer/post-create.sh",
  ".devcontainer/git-guard.sh",
  ".agent/run.sh",
  ".agent/goal.md",
  "docs/AGENT-SANDBOX.md",
];

const FORBIDDEN_MOUNTS = ["docker.sock", "/.ssh", "/.aws", "/.config/gh", "$HOME", "localEnv:HOME"];

// The one host bind mount the sandbox allows: the skills repository, read-only.
const SKILLS_MOUNT_SOURCE = "${localEnv:HOME}/.copilot/skills";
const SKILLS_MOUNT_TARGET = "/home/dev/.copilot/skills";
const SKILLS_APPROVE_PATTERN = /skills/i;
const COMMENT_BLOCK_RE = /\/\*[\s\S]*?\*\//g;
const COMMENT_LINE_RE = /^\s*\/\/.*$/gm;

function stripJsonc(text) {
  return text.replace(COMMENT_BLOCK_RE, "").replace(COMMENT_LINE_RE, "");
}

function parseMounts(entry) {
  const parts = {};
  for (const chunk of String(entry).split(",")) {
    const separator = chunk.indexOf("=");
    if (separator !== -1) {
      parts[chunk.slice(0, separator).trim()] = chunk.slice(separator + 1).trim();
    }
  }
  return parts;
}

function staticChecks(root) {
  const problems = [];

  for (const name of REQUIRED_FILES) {
    const target = path.join(root, name);
    if (!isFile(target)) {
      problems.push(`missing file: ${name}`);
    } else if (fileSize(target) === 0) {
      problems.push(`empty file: ${name}`);
    }
  }

  const devcontainerPath = path.join(root, ".devcontainer/devcontainer.json");
  let devcontainer = {};
  let parsedOk = false;
  if (isFile(devcontainerPath)) {
    const raw = readText(devcontainerPath);
    const leftover = [...new Set(matchAll(PLACEHOLDER_RE, raw).map((match) => match[1]))].sort();
    if (leftover.length) {
      problems.push(`unresolved placeholders in devcontainer.json: ${leftover.join(", ")}`);
    }
    try {
      const parsed = JSON.parse(stripJsonc(raw));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        devcontainer = parsed;
        parsedOk = true;
      } else {
        problems.push("devcontainer.json is not valid JSONC: expected a JSON object");
      }
    } catch (error) {
      problems.push(`devcontainer.json is not valid JSONC: ${error.message}`);
    }
  }

  if (parsedOk) {
    if (devcontainer.remoteUser !== "dev" || devcontainer.containerUser !== "dev") {
      problems.push("devcontainer.json must run as the non-root user 'dev'");
    }
    if (devcontainer.privileged) problems.push("devcontainer.json must not be privileged");

    for (const entry of devcontainer.mounts || []) {
      const parsed = parseMounts(entry);
      const isSkillsMount = parsed.target === SKILLS_MOUNT_TARGET;
      if (isSkillsMount) {
        if (parsed.type !== "bind") problems.push(`the skills mount must be a read-only bind mount: ${entry}`);
        if (parsed.source !== SKILLS_MOUNT_SOURCE) {
          problems.push(`the skills mount must come from ${SKILLS_MOUNT_SOURCE}: ${entry}`);
        }
        if (!String(entry).split(",").includes("readonly") && parsed.readonly === undefined) {
          problems.push(`the skills mount must be read-only: ${entry}`);
        }
        continue;
      }
      if (parsed.type !== "volume") problems.push(`mount is not a named volume: ${entry}`);
      for (const forbidden of FORBIDDEN_MOUNTS) {
        if (String(entry).includes(forbidden)) problems.push(`forbidden mount source '${forbidden}' in ${entry}`);
      }
    }
    if (!(devcontainer.mounts || []).some((entry) => parseMounts(entry).target === SKILLS_MOUNT_TARGET)) {
      problems.push(`devcontainer.json does not mount the skills repository at ${SKILLS_MOUNT_TARGET}`);
    }

    const workspaceMount = devcontainer.workspaceMount || "";
    if (!workspaceMount.includes("type=bind") || !workspaceMount.includes("target=/workspace")) {
      problems.push("workspaceMount must bind the project to /workspace");
    }

    const runArgs = (devcontainer.runArgs || []).join(" ");
    for (const required of [
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--memory=",
      "--cpus=",
      "net.ipv4.ping_group_range",
    ]) {
      if (!runArgs.includes(required)) problems.push(`runArgs is missing ${required}`);
    }

    const vscode = devcontainer.customizations?.vscode || {};
    const extensions = vscode.extensions || [];
    if (!Array.isArray(extensions) || !extensions.every((item) => typeof item === "string" && item.trim())) {
      problems.push("customizations.vscode.extensions must be a JSON array of extension ids");
    }

    const settings = vscode.settings || {};
    if (!["autoApprove", "autopilot"].includes(settings["chat.permissions.default"])) {
      problems.push("chat.permissions.default must be autoApprove or autopilot for unattended chat runs");
    }
    if (Number.parseInt(String(settings["chat.agent.maxRequests"] ?? 0), 10) < 100) {
      problems.push("chat.agent.maxRequests is too low for long runs (>= 100)");
    }
    if (settings["chat.tools.global.autoApprove"] === true) {
      problems.push("chat.tools.global.autoApprove disables safety checks; use chat.permissions.default instead");
    }
    const approveMap = settings["chat.tools.terminal.autoApprove"] || {};
    const keepsRefusal = Object.entries(approveMap).some(
      ([key, value]) => key.startsWith("/") && value === false,
    );
    if (!keepsRefusal) {
      problems.push("chat.tools.terminal.autoApprove keeps no pattern-based refusal (git/rm/curl)");
    }
    const allowsSkills = Object.entries(approveMap).some(
      ([key, value]) => value === true && key.startsWith("/") && SKILLS_APPROVE_PATTERN.test(key),
    );
    if (!allowsSkills) {
      problems.push("chat.tools.terminal.autoApprove does not pre-approve the skills node scripts");
    }
    if (settings["git.enableCommitSigning"] === true) {
      problems.push("git.enableCommitSigning must stay false inside the sandbox");
    }
  }

  const dockerfilePath = path.join(root, ".devcontainer/Dockerfile");
  if (isFile(dockerfilePath)) {
    const dockerfile = readText(dockerfilePath);
    if (!/^USER \S/m.test(dockerfile)) problems.push("Dockerfile never switches to a non-root USER");
    if (!/COPY --chown=root:root git-guard\.sh \/usr\/local\/bin\/git/.test(dockerfile)) {
      problems.push("Dockerfile does not install git-guard.sh as /usr/local/bin/git");
    }
    if (/apt-get install[^\n]*\bsudo\b/.test(dockerfile)) {
      problems.push("Dockerfile installs sudo; the sandbox must not allow escalation");
    }
    if (!/purge[^\n]*\bsudo\b/.test(dockerfile)) {
      problems.push("Dockerfile does not purge sudo, which dev-container base images ship");
    }
    if (!dockerfile.includes("iputils-ping")) {
      problems.push("Dockerfile does not install iputils-ping");
    }
    if (!/setcap\s+-r\s+\/usr\/bin\/ping/.test(dockerfile)) {
      problems.push("Dockerfile does not drop the ping file capability, so ping cannot run under --cap-drop=ALL");
    }
    if (!dockerfile.includes("userdel")) {
      problems.push("Dockerfile does not free UID 1000 before creating the sandbox user");
    }
  }

  const guardPath = path.join(root, ".devcontainer/git-guard.sh");
  if (isFile(guardPath)) {
    const guard = readText(guardPath);
    for (const blocked of ["commit", "push", "rebase"]) {
      if (!guard.includes(blocked)) problems.push(`git-guard.sh does not block ${blocked}`);
    }
    if (!guard.includes("exit 97")) problems.push("git-guard.sh does not exit with code 97");
  }

  const runPath = path.join(root, ".agent/run.sh");
  if (isFile(runPath)) {
    const runScript = readText(runPath);
    for (const flag of ["--allow-all", "--no-ask-user", "--max-autopilot-continues"]) {
      if (!runScript.includes(flag)) problems.push(`run.sh does not use ${flag}`);
    }
    if (!isExecutable(runPath)) problems.push("run.sh is not executable");
  }

  for (const script of [".devcontainer/post-create.sh", ".devcontainer/stack-tools.sh", ".devcontainer/git-guard.sh"]) {
    const target = path.join(root, script);
    if (isFile(target) && !isExecutable(target)) problems.push(`${script} is not executable`);
  }

  const postCreatePath = path.join(root, ".devcontainer/post-create.sh");
  if (isFile(postCreatePath)) {
    const postCreate = readText(postCreatePath);
    if (!postCreate.includes("permissions-config.json")) {
      problems.push("post-create.sh does not seed the CLI permissions-config.json");
    }
    if (!postCreate.includes("node:*")) {
      problems.push("post-create.sh does not pre-approve node commands for the Copilot CLI");
    }
    if (!postCreate.includes("allowed_directories") || !postCreate.includes("skills")) {
      problems.push("post-create.sh does not allow the skills directory in the CLI permissions");
    }
  }

  const docsPath = path.join(root, "docs/AGENT-SANDBOX.md");
  if (isFile(docsPath)) {
    const docs = readText(docsPath).toLowerCase();
    for (const needle of ["read-only", "allow-all", "--no-ask-user", "docker.sock", "skills", "permissions-config.json"]) {
      if (!docs.includes(needle)) problems.push(`AGENT-SANDBOX.md does not document '${needle}'`);
    }
    const leftover = [...new Set(matchAll(PLACEHOLDER_RE, readText(docsPath)).map((match) => match[1]))].sort();
    if (leftover.length) {
      problems.push(`unresolved placeholders in AGENT-SANDBOX.md: ${leftover.join(", ")}`);
    }
  }

  const agentsPath = path.join(root, "AGENTS.md");
  if (isFile(agentsPath)) {
    const agents = readText(agentsPath);
    if (!agents.includes("<!-- BEGIN agent-sandbox -->") || !agents.includes("<!-- END agent-sandbox -->")) {
      problems.push("AGENTS.md is missing the agent-sandbox section markers");
    }
    if (!agents.toLowerCase().includes("read-only")) {
      problems.push("AGENTS.md does not state the read-only Git policy");
    }
  } else {
    problems.push("missing file: AGENTS.md");
  }

  const gitignorePath = path.join(root, ".gitignore");
  if (isFile(gitignorePath) && !readText(gitignorePath).includes(".agent/logs/")) {
    problems.push(".gitignore does not ignore .agent/logs/");
  }

  return problems;
}

function run(command) {
  const [program, ...args] = command;
  const completed = spawnSync(program, args, { encoding: "utf8" });
  return {
    code: completed.status,
    output: `${completed.stdout || ""}${completed.stderr || ""}`.trim(),
  };
}

function dockerChecks(root, tag) {
  const problems = [];
  const context = path.join(root, ".devcontainer");
  let result = run(["docker", "build", "-t", tag, "-f", path.join(context, "Dockerfile"), context]);
  if (result.code !== 0) return [`docker build failed:\n${result.output.slice(-3000)}`];

  result = run(["docker", "run", "--rm", tag, "id", "-u"]);
  if (result.code !== 0 || result.output.trim() === "0") {
    problems.push(`container does not run as a non-root user: ${result.output.trim()}`);
  }

  result = run(["docker", "run", "--rm", tag, "git", "commit", "-m", "smoke"]);
  if (result.code !== 97) {
    problems.push(`git-guard did not refuse 'git commit' (exit ${result.code}): ${result.output.slice(-500)}`);
  }

  result = run(["docker", "run", "--rm", tag, "git", "--version"]);
  if (result.code !== 0 || !result.output.includes("git version")) {
    problems.push(`the git shim does not delegate to the real git (exit ${result.code}): ${result.output.slice(-500)}`);
  }

  result = run(["docker", "run", "--rm", tag, "sh", "-c", "command -v sudo"]);
  if (result.code === 0) problems.push(`sudo is available in the image: ${result.output.trim()}`);

  result = run(["docker", "run", "--rm", tag, "copilot", "--version"]);
  if (result.code !== 0) {
    problems.push(`copilot CLI is not available in the image: ${result.output.slice(-500)}`);
  }

  result = run([
    "docker", "run", "--rm",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--sysctl=net.ipv4.ping_group_range=0 2147483647",
    tag, "ping", "-c", "1", "-W", "2", "127.0.0.1",
  ]);
  if (result.code !== 0) {
    problems.push(`ping does not work in the hardened container: ${result.output.slice(-500)}`);
  }

  return problems;
}

const PROG = "verify-sandbox.mjs";

const SPEC = {
  description: "Verify the rendered AI sandbox.",
  options: {
    dest: { type: "string", required: true, description: "repository root" },
    "docker-build": { type: "boolean", description: "build the image and test it" },
    tag: { type: "string", default: "ai-sandbox-verify", description: "image tag for --docker-build" },
  },
  positionals: [],
};

function main(argv) {
  let values;
  try {
    values = parseArgs(argv, SPEC, { prog: PROG });
  } catch (error) {
    if (error instanceof Error && error.name === "UsageError") failUsage(PROG, SPEC, error.message);
    throw error;
  }
  if (values.dest === undefined) failUsage(PROG, SPEC, "the following arguments are required: --dest");

  const root = path.resolve(values.dest);
  const problems = staticChecks(root);

  if (values["docker-build"] && !problems.length) {
    problems.push(...dockerChecks(root, values.tag));
  }

  if (problems.length) {
    for (const problem of problems) writeErr(`error: ${problem}\n`);
    return 1;
  }

  const suffix = values["docker-build"] ? " (static + docker)" : " (static)";
  writeOut(`sandbox OK${suffix}: ${root}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
