#!/usr/bin/env node
/**
 * Repository self-check: runs every skill script against a throwaway directory and
 * asserts that the rendered output verifies. No network, no Docker, no dependencies.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = {
  scaffold: path.join(ROOT, "init-ai-ready-project/scripts/scaffold.mjs"),
  update: path.join(ROOT, "init-ai-ready-project/scripts/update.mjs"),
  checkOutput: path.join(ROOT, "init-ai-ready-project/scripts/check-output.mjs"),
  sandboxScaffold: path.join(ROOT, "init-devcontainer-ai-sandbox/scripts/scaffold-sandbox.mjs"),
  sandboxVerify: path.join(ROOT, "init-devcontainer-ai-sandbox/scripts/verify-sandbox.mjs"),
  sandboxUninstall: path.join(ROOT, "init-devcontainer-ai-sandbox/scripts/uninstall-sandbox.mjs"),
  specPlan: path.join(ROOT, "spec-workflow/scripts/spec-plan.mjs"),
  allow: path.join(ROOT, "scripts/allow-skills.mjs"),
  aispec: path.join(ROOT, "bin/aispec"),
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-skills-smoke-"));
// A throwaway Copilot home: no run may read or write the real permissions config.
const COPILOT_HOME = path.join(work, "copilot-home");
const ENV = { ...process.env, COPILOT_HOME };
let failures = 0;

function report(name, ok, detail) {
  if (ok) {
    process.stdout.write(`ok   ${name}\n`);
    return;
  }
  failures += 1;
  process.stdout.write(`FAIL ${name}\n${detail || ""}\n`);
}

function run(name, script, args, { cwd = ROOT, expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: ENV });
  const ok = result.status === expect;
  report(name, ok, `exit ${result.status}, expected ${expect}\n${result.stdout || ""}${result.stderr || ""}`);
  return result.stdout || "";
}

function placeholders(output) {
  const keys = [];
  for (const line of output.trim().split("\n")) {
    const key = line.trim().split(/\s+/)[0];
    if (key) keys.push(key);
  }
  return keys;
}

function writeValues(file, values) {
  fs.writeFileSync(file, `${JSON.stringify(values, null, 2)}\n`, "utf8");
  return file;
}

try {
  // Every script must start and describe itself.
  for (const [name, script] of Object.entries(S)) {
    run(`help: ${path.basename(script)}`, script, ["--help"]);
  }

  // Host approvals for the skills: merged into a throwaway config, never the real one.
  const allowRepo = path.join(work, "allow-repo");
  fs.mkdirSync(allowRepo, { recursive: true });
  const allowConfig = path.join(work, "allow-config", "permissions-config.json");
  fs.mkdirSync(path.dirname(allowConfig), { recursive: true });
  const otherLocation = { tool_approvals: [{ kind: "commands", commandIdentifiers: ["node:*"] }] };
  const seedConfig = { locations: { "/some/other/repo": otherLocation } };
  fs.writeFileSync(allowConfig, `${JSON.stringify(seedConfig, null, 2)}\n`, "utf8");

  run("skill-allow: approve", S.allow, ["--dir", allowRepo, "--config", allowConfig]);
  run("skill-allow: approve again", S.allow, ["--dir", allowRepo, "--config", allowConfig]);
  const allowData = JSON.parse(fs.readFileSync(allowConfig, "utf8"));
  const allowKeys = Object.keys(allowData.locations || {});
  report(
    "skill-allow keeps existing locations",
    JSON.stringify(allowData.locations?.["/some/other/repo"]) === JSON.stringify(otherLocation),
    `locations: ${JSON.stringify(allowData.locations)}`,
  );
  const addedKeys = allowKeys.filter((key) => key !== "/some/other/repo");
  const added = addedKeys.length === 1 ? allowData.locations[addedKeys[0]] : null;
  report(
    "skill-allow approves node and the skills directory once",
    Boolean(added) &&
      added.tool_approvals?.length === 1 &&
      added.tool_approvals[0].commandIdentifiers?.includes("aispec:*") &&
      added.allowed_directories?.includes(fs.realpathSync(ROOT)),
    `location: ${JSON.stringify(added)}`,
  );
  run("skill-allow: remove", S.allow, ["--dir", allowRepo, "--config", allowConfig, "--remove"]);
  const afterRemove = JSON.parse(fs.readFileSync(allowConfig, "utf8"));
  report(
    "skill-allow remove restores the seed",
    JSON.stringify(afterRemove) === JSON.stringify(seedConfig),
    `got ${JSON.stringify(afterRemove)}`,
  );

  // One command in front of every script: verb routing and argument passthrough.
  const dispatch = run("aispec: dispatch a verb", S.aispec, ["plan", "--help"]);
  report(
    "aispec forwards arguments to the verb's script",
    dispatch.startsWith("usage: spec-plan.mjs"),
    `got:\n${dispatch.slice(0, 200)}`,
  );
  run("aispec: unknown verb", S.aispec, ["nope"], { expect: 2 });

  // AI-ready project scaffold: render, verify, and confirm update is a no-op.
  const readyNames = placeholders(run("list variables: scaffold", S.scaffold, ["--list-variables"]));
  const readyValues = writeValues(
    path.join(work, "ready-values.json"),
    Object.fromEntries(readyNames.map((key) => [key, `Smoke value for ${key.toLowerCase()}`])),
  );
  const readyRepo = path.join(work, "ready-repo");
  run("render: ai-ready scaffold", S.scaffold, [
    "--dest", readyRepo, "--values", readyValues, "--gitignore", "node",
  ]);
  run("verify: ai-ready scaffold", S.checkOutput, ["--dest", readyRepo]);

  const permissions = JSON.parse(fs.readFileSync(path.join(COPILOT_HOME, "permissions-config.json"), "utf8"));
  const approved = permissions.locations?.[fs.realpathSync(readyRepo)];
  report(
    "scaffold approves the skills for the new repository",
    Boolean(approved?.tool_approvals?.some((rule) => rule.commandIdentifiers?.includes("aispec:*"))) &&
      Boolean(approved?.allowed_directories?.includes(fs.realpathSync(ROOT))),
    `location: ${JSON.stringify(approved)}`,
  );

  const optedOut = path.join(work, "ready-no-approval");
  run("render: ai-ready scaffold (--no-allow-skills)", S.scaffold, [
    "--dest", optedOut, "--values", readyValues, "--no-allow-skills",
  ]);
  const afterOptOut = JSON.parse(fs.readFileSync(path.join(COPILOT_HOME, "permissions-config.json"), "utf8"));
  report(
    "--no-allow-skills writes no approval",
    afterOptOut.locations?.[fs.realpathSync(optedOut)] === undefined,
    `locations: ${Object.keys(afterOptOut.locations || {}).join(", ")}`,
  );
  const baseline = run("update: ai-ready scaffold", S.update, ["--dest", readyRepo]);
  report(
    "update is idempotent",
    baseline.includes("baseline OK"),
    `expected "baseline OK", got:\n${baseline}`,
  );

  // AI dev-container sandbox: render and verify.
  const sandboxNames = placeholders(run("list variables: sandbox", S.sandboxScaffold, ["--list-variables"]));
  const sandboxValues = {};
  for (const key of sandboxNames) {
    if (key === "MODEL_PROVIDER_EXTENSIONS") continue;
    if (key === "VSCODE_EXTENSIONS") sandboxValues[key] = '["github.copilot"]';
    else if (key === "FORWARD_PORTS") sandboxValues[key] = "[3000]";
    else sandboxValues[key] = `Smoke value for ${key.toLowerCase()}`;
  }
  sandboxValues.PROJECT_NAME = "smoke";
  sandboxValues.PROJECT_SLUG = "smoke";
  const sandboxRepo = path.join(work, "sandbox-repo");
  fs.mkdirSync(sandboxRepo, { recursive: true });
  run("render: agent sandbox", S.sandboxScaffold, [
    "--dest", sandboxRepo, "--values", writeValues(path.join(work, "sandbox-values.json"), sandboxValues),
  ]);
  run("verify: agent sandbox", S.sandboxVerify, ["--dest", sandboxRepo]);

  // The uninstaller removes exactly what the renderer wrote, and only that.
  const sandboxPaths = [
    ".devcontainer",
    ".agent",
    "docs/AGENT-SANDBOX.md",
    "docs/DEVELOPER-GUIDE.md",
    "AGENTS.md",
    ".gitignore",
  ];
  run("uninstall: agent sandbox (dry run)", S.sandboxUninstall, ["--dest", sandboxRepo, "--dry-run"]);
  report(
    "uninstall dry run is read-only",
    fs.existsSync(path.join(sandboxRepo, ".devcontainer/devcontainer.json")),
    "the dry run removed files",
  );
  run("uninstall: agent sandbox", S.sandboxUninstall, ["--dest", sandboxRepo]);
  const leftover = sandboxPaths.filter((name) => fs.existsSync(path.join(sandboxRepo, name)));
  report("uninstall removes the sandbox", leftover.length === 0, `still present: ${leftover.join(", ")}`);
  run("uninstall is idempotent", S.sandboxUninstall, ["--dest", sandboxRepo]);

  const keepRepo = path.join(work, "sandbox-keep");
  fs.mkdirSync(keepRepo, { recursive: true });
  fs.writeFileSync(path.join(keepRepo, "AGENTS.md"), "# Keep me\n\nUser notes.\n", "utf8");
  fs.writeFileSync(path.join(keepRepo, ".gitignore"), "node_modules/\n", "utf8");
  run("render: agent sandbox (existing docs)", S.sandboxScaffold, [
    "--dest", keepRepo, "--values", path.join(work, "sandbox-values.json"),
  ]);
  run("uninstall: agent sandbox (existing docs)", S.sandboxUninstall, ["--dest", keepRepo]);
  const keptAgents = fs.readFileSync(path.join(keepRepo, "AGENTS.md"), "utf8");
  const keptIgnore = fs.readFileSync(path.join(keepRepo, ".gitignore"), "utf8");
  report(
    "uninstall keeps project content",
    !keptAgents.includes("agent-sandbox") &&
      keptAgents.includes("User notes.") &&
      keptIgnore === "node_modules/\n" &&
      !fs.existsSync(path.join(keepRepo, ".devcontainer")),
    `AGENTS.md:\n${keptAgents}\n.gitignore:\n${keptIgnore}`,
  );

  // Spec workflow: a minimal repository with one plan.
  const planRepo = path.join(work, "plan-repo");
  fs.mkdirSync(path.join(planRepo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(planRepo, "tech-plans"), { recursive: true });
  fs.writeFileSync(
    path.join(planRepo, "tech-plans", "001-smoke.md"),
    [
      "---",
      "title: Smoke plan",
      "date: 2026-01-01",
      "status: draft",
      "type: chore",
      "impact: low",
      "area: tests",
      "version_bump: none",
      "---",
      "",
      "## Summary",
      "",
      "Smoke.",
      "",
      "## Why",
      "",
      "Because.",
      "",
      "## Goals",
      "",
      "- prove the helper works",
      "",
      "## Affected modules",
      "",
      "none",
      "",
      "## Proposed solution",
      "",
      "Run it.",
      "",
      "## Implementation checklist",
      "",
      "- [x] open questions resolved",
      "- [x] quality suite",
      "- [x] implementation notes",
      "",
    ].join("\n"),
    "utf8",
  );
  const number = run("spec-plan: next-number", S.specPlan, ["next-number"], { cwd: planRepo }).trim();
  report("spec-plan: next number is 002", number === "002", `got ${JSON.stringify(number)}`);
  run("spec-plan: list", S.specPlan, ["list"], { cwd: planRepo });
  run("spec-plan: show", S.specPlan, ["show", "1"], { cwd: planRepo });
  run("spec-plan: validate", S.specPlan, ["validate", "001", "--strict"], { cwd: planRepo });
  run("spec-plan: gate implement", S.specPlan, ["validate-for", "implement", "001"], { cwd: planRepo });
  run("spec-plan: config", S.specPlan, ["config"], { cwd: planRepo });

  // A retrospective record follows the existing review and close gates across iterations.
  const planFile = path.join(planRepo, "tech-plans", "001-smoke.md");
  run("spec-fast: start retrospective record", S.specPlan, ["set-status", "001", "in-progress"], { cwd: planRepo });
  run("spec-fast: gate review", S.specPlan, ["validate-for", "review", "001"], { cwd: planRepo });
  run("spec-fast: no close before review", S.specPlan, ["validate-for", "close", "001"], { cwd: planRepo, expect: 1 });
  fs.appendFileSync(planFile, "\n## Review Notes\n\n- **Verdict**: PASS\n", "utf8");
  run("spec-fast: mark reviewed", S.specPlan, ["set-status", "001", "reviewed"], { cwd: planRepo });
  run("spec-fast: close gate after PASS", S.specPlan, ["validate-for", "close", "001"], { cwd: planRepo });
  run("spec-fast: invalidate prior review", S.specPlan, ["set-status", "001", "in-progress"], { cwd: planRepo });
  run("spec-fast: no close during iteration", S.specPlan, ["validate-for", "close", "001"], { cwd: planRepo, expect: 1 });
  fs.appendFileSync(planFile, "\n## Review Notes\n\n- **Verdict**: NEEDS WORK\n", "utf8");
  run("spec-fast: simulate stale reviewed status", S.specPlan, ["set-status", "001", "reviewed"], { cwd: planRepo });
  run("spec-fast: latest NEEDS WORK blocks close", S.specPlan, ["validate-for", "close", "001"], { cwd: planRepo, expect: 1 });
  run("spec-fast: resume iteration", S.specPlan, ["set-status", "001", "in-progress"], { cwd: planRepo });
  fs.appendFileSync(planFile, "\n## Review Notes\n\n- **Verdict**: PASS\n", "utf8");
  run("spec-fast: complete checklist", S.specPlan, ["checklist", "001"], { cwd: planRepo });
  run("spec-fast: validate completed record", S.specPlan, ["validate", "001", "--strict"], { cwd: planRepo });
  run("spec-fast: mark fresh review", S.specPlan, ["set-status", "001", "reviewed"], { cwd: planRepo });
  run("spec-fast: close gate after fresh PASS", S.specPlan, ["validate-for", "close", "001"], { cwd: planRepo });
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failures) {
  process.stdout.write(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write("\nsmoke OK\n");
