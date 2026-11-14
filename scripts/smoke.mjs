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
  specPlan: path.join(ROOT, "spec-workflow/scripts/spec-plan.mjs"),
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-skills-smoke-"));
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
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
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
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failures) {
  process.stdout.write(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write("\nsmoke OK\n");
