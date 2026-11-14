#!/usr/bin/env node
/**
 * Deterministic tech-plan operations for the spec-* workflow skills.
 *
 * Zero dependencies, Node.js 22+ standard library only. Every subcommand resolves
 * the repository root from the current working directory (nearest ancestor holding
 * `.git`), reads an optional `.spec-workflow.yml` profile, and never modifies files
 * outside the configured plan directories.
 *
 * Commands:
 *   next-number
 *   list [--status STATUS]
 *   show REF
 *   checklist REF
 *   validate REF [--strict]
 *   validate-for {implement|review|close} REF
 *   set-status REF STATUS
 *   archive REF
 *   config
 *
 * REF is a plan number (007), a number plus slug (007-my-feature), or a path.
 */

import fs from "node:fs";
import path from "node:path";

import { failUsage, parseArgs } from "../../lib/cli.mjs";
import { globMarkdown, isDir, isFile, moveFile, readText, realpath, writeText } from "../../lib/fsx.mjs";
import {
  FRONTMATTER_RE,
  checklistItems,
  matchAll,
  sectionLookup,
  sections,
  verdicts,
} from "../../lib/markdown.mjs";
import { padEnd, pyRepr, writeErr, writeOut } from "../../lib/text.mjs";
import { parseMiniYaml } from "../../lib/yaml.mjs";

const PROG = "spec-plan.mjs";
const CONFIG_NAMES = [".spec-workflow.yml", ".spec-workflow.yaml"];
const DEFAULT_STATUSES = ["draft", "in-progress", "reviewed", "done"];
const DEFAULT_REQUIRED_FIELDS = ["title", "date", "status", "type", "impact", "area"];
const DEFAULT_REQUIRED_SECTIONS = [
  "Summary",
  "Why",
  "Goals",
  "Affected modules",
  "Proposed solution",
  "Implementation checklist",
];
const KNOWN_TYPES = new Set(["feature", "fix", "refactor", "perf", "docs", "test", "security", "chore"]);
const KNOWN_IMPACT = new Set(["low", "medium", "high"]);
const KNOWN_BUMPS = new Set(["patch", "minor", "major", "none"]);
const CHECKLIST_MANDATORY = ["open questions resolved", "quality suite", "implementation notes"];
const STATUS_LINE_RE = /^(status:[ \t]*).*$/m;
const IMPLEMENTATION_NOTES_RE = /^## Implementation Notes/m;
const REVIEW_NOTES_RE = /^## Review Notes/m;

class PlanError extends Error {}

// ── Config ───────────────────────────────────────────────────────────

function findRoot(start) {
  let current = realpath(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

function asPath(root, value) {
  const text = String(value);
  return path.isAbsolute(text) ? path.resolve(text) : path.join(root, text);
}

function parseWidth(raw) {
  if (raw === true) return 1;
  if (raw === false) return 0;
  const text = String(raw === null || raw === undefined ? "" : raw).trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : 3;
}

function listSetting(raw, fallback) {
  if (Array.isArray(raw) && raw.length) return raw.map((item) => String(item));
  if (typeof raw === "string" && raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
  }
  return [...fallback];
}

function loadConfig(root) {
  const base = root || findRoot();
  let raw = {};
  for (const name of CONFIG_NAMES) {
    const candidate = path.join(base, name);
    if (isFile(candidate)) {
      raw = parseMiniYaml(readText(candidate));
      break;
    }
  }

  const planDir = asPath(base, raw.plan_dir || "tech-plans");
  const draftRaw = Object.hasOwn(raw, "draft_dir") ? raw.draft_dir : null;

  let draftDir;
  if (draftRaw === null) {
    draftDir = isDir(path.join(planDir, "draft")) ? path.join(planDir, "draft") : null;
  } else if (["", "false", "none", "null"].includes(String(draftRaw).trim().toLowerCase())) {
    draftDir = null;
  } else {
    draftDir = asPath(base, draftRaw);
  }

  const archiveDir = asPath(base, raw.archive_dir || path.join(planDir, "archive"));

  return {
    root: base,
    planDir,
    draftDir,
    archiveDir,
    numberWidth: parseWidth(raw.number_width || 3),
    filenamePrefix: String(raw.filename_prefix || "").trim(),
    statuses: listSetting(raw.statuses, DEFAULT_STATUSES),
    requiredFields: listSetting(raw.required_fields, DEFAULT_REQUIRED_FIELDS),
    requiredSections: listSetting(raw.required_sections, DEFAULT_REQUIRED_SECTIONS),
    planDirs() {
      return this.draftDir ? [this.planDir, this.draftDir] : [this.planDir];
    },
    asDict() {
      return {
        root: this.root,
        plan_dir: this.planDir,
        draft_dir: this.draftDir || null,
        archive_dir: this.archiveDir,
        number_width: this.numberWidth,
        filename_prefix: this.filenamePrefix,
        statuses: this.statuses,
        required_fields: this.requiredFields,
        required_sections: this.requiredSections,
      };
    },
  };
}

// ── Plan files ───────────────────────────────────────────────────────

function loadPlan(filePath) {
  const text = readText(filePath);
  const match = FRONTMATTER_RE.exec(text);
  const meta = match ? parseMiniYaml(match[1]) : {};
  const body = match ? text.slice(match[0].length) : text;
  const stem = path.basename(filePath, path.extname(filePath));
  return {
    path: filePath,
    meta,
    body,
    text,
    status: String(meta.status === undefined || meta.status === null ? "" : meta.status).trim(),
    title: String(meta.title === undefined || meta.title === null ? "" : meta.title).trim(),
    number: planNumber(filePath),
    stem,
  };
}

function planNumber(filePath) {
  const match = /(\d+)/.exec(path.basename(filePath));
  return match ? Number.parseInt(match[1], 10) : null;
}

function planSlug(filePath) {
  const name = path.basename(filePath);
  const extension = path.extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  const match = /\d+-(.+)$/.exec(stem);
  return match ? match[1] : "";
}

function iterPlans(cfg, includeArchive = true) {
  const seen = new Set();
  const plans = [];
  const dirs = [...cfg.planDirs(), ...(includeArchive ? [cfg.archiveDir] : [])];
  for (const directory of dirs) {
    if (!isDir(directory)) continue;
    for (const filePath of globMarkdown(directory)) {
      const resolved = realpath(filePath);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      plans.push(loadPlan(filePath));
    }
  }
  return plans;
}

function resolveRef(cfg, rawRef) {
  const ref = String(rawRef).trim();
  if (ref.endsWith(".md") || ref.includes("/") || ref.includes("\\")) {
    for (const candidate of [ref, path.join(process.cwd(), ref), path.join(cfg.root, ref)]) {
      if (isFile(candidate)) return realpath(candidate);
    }
    throw new PlanError(`plan file not found: ${ref}`);
  }

  const match = /^[A-Za-z_-]*?(\d+)(?:-(.+))?$/.exec(ref);
  if (!match) {
    throw new PlanError(`invalid plan reference '${ref}' (expected NNN, NNN-slug, or a path)`);
  }
  const number = Number.parseInt(match[1], 10);
  const slug = match[2];
  const label = String(number).padStart(cfg.numberWidth, "0");

  const matches = [];
  for (const directory of [...cfg.planDirs(), cfg.archiveDir]) {
    if (!isDir(directory)) continue;
    for (const filePath of globMarkdown(directory)) {
      if (planNumber(filePath) !== number) continue;
      if (slug !== undefined && planSlug(filePath) !== slug) continue;
      matches.push(realpath(filePath));
    }
  }

  const unique = [...new Set(matches)].sort();
  if (unique.length === 1) return unique[0];
  if (!unique.length) {
    throw new PlanError(`no plan numbered ${label}${slug ? ` with slug '${slug}'` : ""}`);
  }
  const listing = unique.map((item) => `  - ${path.basename(item)}`).join("\n");
  throw new PlanError(`ambiguous plan number ${label}:\n${listing}`);
}

// ── Validation ───────────────────────────────────────────────────────

function collectValidation(cfg, plan, strict) {
  const errors = [];
  const warnings = [];

  if (!Object.keys(plan.meta).length) {
    errors.push("missing YAML frontmatter");
    return { errors, warnings };
  }

  for (const name of cfg.requiredFields) {
    const value = plan.meta[name];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      errors.push(`missing required frontmatter field: ${name}`);
    }
  }

  const status = plan.status;
  if (status && !cfg.statuses.includes(status)) {
    errors.push(`invalid status '${status}' (allowed: ${cfg.statuses.join(", ")})`);
  }

  const dateValue = String(plan.meta.date === undefined || plan.meta.date === null ? "" : plan.meta.date).trim();
  if (dateValue && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    errors.push(`invalid date '${dateValue}' (expected YYYY-MM-DD)`);
  }

  const planType = String(plan.meta.type === undefined ? "" : plan.meta.type).trim().toLowerCase();
  if (planType && !KNOWN_TYPES.has(planType)) {
    warnings.push(`unknown type '${planType}' (known: ${[...KNOWN_TYPES].sort().join(", ")})`);
  }

  const impact = String(plan.meta.impact === undefined ? "" : plan.meta.impact).trim().toLowerCase();
  if (impact && !KNOWN_IMPACT.has(impact)) {
    errors.push(`invalid impact '${impact}' (allowed: low, medium, high)`);
  }

  const bump = String(plan.meta.version_bump === undefined ? "" : plan.meta.version_bump).trim().toLowerCase();
  if (!bump) {
    warnings.push("version_bump is not set (close will ask instead of bumping automatically)");
  } else if (!KNOWN_BUMPS.has(bump)) {
    warnings.push(`unknown version_bump '${bump}' (known: ${[...KNOWN_BUMPS].sort().join(", ")})`);
  }

  const dependsOn = plan.meta.depends_on;
  if (dependsOn !== undefined && dependsOn !== null && !Array.isArray(dependsOn)) {
    errors.push("depends_on must be a YAML list");
  }

  const found = sections(plan.body);
  for (const name of cfg.requiredSections) {
    const value = sectionLookup(found, name);
    if (value === null) {
      errors.push(`missing required section: ## ${name}`);
    } else if (!value.trim() && name !== "Implementation checklist") {
      errors.push(`empty required section: ## ${name}`);
    }
  }

  const items = checklistItems(plan.text);
  if (!items.length) {
    warnings.push("implementation checklist has no '- [ ]' items");
  } else {
    const done = items.filter((item) => item.checked).length;
    if (strict && done !== items.length) {
      errors.push(`implementation checklist incomplete (${done}/${items.length} ticked)`);
    }
    const labels = items.map((item) => item.text.toLowerCase()).join(" | ");
    for (const mandatory of CHECKLIST_MANDATORY) {
      if (!labels.includes(mandatory.toLowerCase())) {
        warnings.push(`implementation checklist is missing the mandatory item '${mandatory}'`);
      }
    }
  }

  if (planType === "security" && sectionLookup(found, "Security considerations") === null) {
    warnings.push("security plan has no '## Security considerations' section");
  }

  return { errors, warnings };
}

function runValidation(cfg, plan, strict) {
  const { errors, warnings } = collectValidation(cfg, plan, strict);
  for (const warning of warnings) writeOut(`WARN: ${warning}\n`);
  for (const error of errors) writeErr(`ERROR: ${error}\n`);
  if (errors.length) {
    writeErr(`INVALID: ${path.basename(plan.path)} (${errors.length} error(s), ${warnings.length} warning(s))\n`);
    return 1;
  }
  writeOut(`OK: ${path.basename(plan.path)} (${warnings.length} warning(s))\n`);
  return 0;
}

function unmetDependencies(cfg, plan) {
  const problems = [];
  const dependsOn = plan.meta.depends_on || [];
  if (!Array.isArray(dependsOn)) return problems;
  for (const entry of dependsOn) {
    let resolved;
    try {
      resolved = resolveRef(cfg, String(entry));
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      problems.push(`dependency ${entry} not found`);
      continue;
    }
    const dependency = loadPlan(resolved);
    if (dependency.status !== "done") {
      problems.push(`dependency ${entry} is '${dependency.status}', expected 'done'`);
    }
  }
  return problems;
}

function validateFor(cfg, plan, phase) {
  const contract = {
    implement: { allowed: ["draft", "in-progress"], label: "draft (new) or in-progress (resume)" },
    review: { allowed: ["in-progress"], label: "in-progress" },
    close: { allowed: ["reviewed"], label: "reviewed" },
  }[phase];

  if (!contract.allowed.includes(plan.status)) {
    writeErr(
      `ERROR: cannot ${phase} ${path.basename(plan.path)} — status is '${plan.status}', expected ${contract.label}\n`,
    );
    return 1;
  }

  if (phase === "close") {
    const found = verdicts(plan.text);
    if (!found.length || found[found.length - 1].toUpperCase() !== "PASS") {
      const latest = found.length ? found[found.length - 1].toUpperCase() : "none";
      writeErr(`ERROR: cannot close — latest review verdict is ${latest}, expected PASS\n`);
      return 1;
    }
  }

  if (phase === "implement") {
    const problems = unmetDependencies(cfg, plan);
    if (problems.length) {
      for (const problem of problems) writeErr(`ERROR: ${problem}\n`);
      return 1;
    }
  }

  const { errors, warnings } = collectValidation(cfg, plan, false);
  for (const error of errors) writeErr(`ERROR: ${error}\n`);
  for (const warning of warnings) writeOut(`WARN: ${warning}\n`);
  if (errors.length) return 1;

  writeOut(`OK: ${path.basename(plan.path)} ready for ${phase} (status: ${plan.status})\n`);
  return 0;
}

// ── Commands ─────────────────────────────────────────────────────────

function cmdNextNumber(cfg) {
  let highest = 0;
  for (const plan of iterPlans(cfg)) {
    if (plan.number !== null) highest = Math.max(highest, plan.number);
  }
  writeOut(`${cfg.filenamePrefix}${String(highest + 1).padStart(cfg.numberWidth, "0")}\n`);
  return 0;
}

function cmdList(cfg, values) {
  let plans = iterPlans(cfg).filter((plan) => path.dirname(plan.path) !== cfg.archiveDir);
  if (values.status !== "all") plans = plans.filter((plan) => plan.status === values.status);
  if (!plans.length) {
    writeOut("no plans\n");
    return 0;
  }
  plans = plans.sort((left, right) => {
    const byNumber = (left.number || 0) - (right.number || 0);
    if (byNumber !== 0) return byNumber;
    return path.basename(left.path) < path.basename(right.path) ? -1 : path.basename(left.path) > path.basename(right.path) ? 1 : 0;
  });
  for (const plan of plans) {
    const items = checklistItems(plan.text);
    const done = items.filter((item) => item.checked).length;
    const progress = items.length ? `${done}/${items.length}` : "-";
    const type = Object.hasOwn(plan.meta, "type") ? plan.meta.type : "-";
    const impact = Object.hasOwn(plan.meta, "impact") ? plan.meta.impact : "-";
    writeOut(
      `${padEnd(plan.stem, 44)} ${padEnd(plan.status, 12)} ${padEnd(type, 9)} ${padEnd(impact, 7)} ${padEnd(progress, 7)} ${plan.title}\n`,
    );
  }
  return 0;
}

function cmdShow(cfg, values) {
  const plan = loadPlan(resolveRef(cfg, values.ref));
  writeOut(`file: ${plan.path}\n`);
  for (const key of ["title", "status", "type", "impact", "area", "version_bump", "depends_on", "tags"]) {
    if (Object.hasOwn(plan.meta, key)) writeOut(`${key}: ${pyRepr(plan.meta[key])}\n`);
  }
  const items = checklistItems(plan.text);
  if (items.length) {
    const done = items.filter((item) => item.checked).length;
    writeOut(`checklist: ${done}/${items.length}\n`);
  }
  const found = verdicts(plan.text);
  writeOut(`verdict: ${found.length ? found[found.length - 1].toUpperCase() : "none"}\n`);
  writeOut(`implementation_notes: ${matchAll(IMPLEMENTATION_NOTES_RE, plan.text).length}\n`);
  writeOut(`review_rounds: ${matchAll(REVIEW_NOTES_RE, plan.text).length}\n`);
  return 0;
}

function cmdChecklist(cfg, values) {
  const plan = loadPlan(resolveRef(cfg, values.ref));
  const items = checklistItems(plan.text);
  if (!items.length) {
    writeOut("no checklist items\n");
    return 1;
  }
  for (const item of items) {
    if (!item.checked) writeOut(`${path.basename(plan.path)}:${item.line}: ${item.text}\n`);
  }
  const done = items.filter((item) => item.checked).length;
  writeOut(`${done}/${items.length} complete\n`);
  return done === items.length ? 0 : 2;
}

function cmdValidate(cfg, values) {
  return runValidation(cfg, loadPlan(resolveRef(cfg, values.ref)), values.strict === true);
}

function cmdValidateFor(cfg, values) {
  return validateFor(cfg, loadPlan(resolveRef(cfg, values.ref)), values.phase);
}

function movePlan(filePath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const destination = path.join(targetDir, path.basename(filePath));
  if (realpath(destination) === realpath(filePath)) return filePath;
  if (fs.existsSync(destination)) {
    throw new PlanError(`cannot move ${path.basename(filePath)}: ${destination} already exists`);
  }
  return moveFile(filePath, destination);
}

function cmdSetStatus(cfg, values) {
  if (!cfg.statuses.includes(values.status)) {
    throw new PlanError(`invalid status '${values.status}' (allowed: ${cfg.statuses.join(", ")})`);
  }
  let filePath = resolveRef(cfg, values.ref);
  const plan = loadPlan(filePath);
  if (!FRONTMATTER_RE.test(plan.text)) {
    throw new PlanError(`${path.basename(filePath)} has no YAML frontmatter`);
  }
  if (plan.status === values.status) {
    writeOut(`${path.basename(filePath)} already '${values.status}'\n`);
    return 0;
  }

  const updated = plan.text.replace(STATUS_LINE_RE, (_match, prefix) => `${prefix}${values.status}`);
  writeText(filePath, updated);

  if (values.status === "draft" && cfg.draftDir) {
    filePath = movePlan(filePath, cfg.draftDir);
  } else if (values.status !== "draft" && cfg.draftDir && realpath(path.dirname(filePath)) === realpath(cfg.draftDir)) {
    filePath = movePlan(filePath, cfg.planDir);
  }

  writeOut(`${path.basename(filePath)} → status: ${values.status}\n`);
  return 0;
}

function cmdArchive(cfg, values) {
  const filePath = resolveRef(cfg, values.ref);
  const plan = loadPlan(filePath);
  if (plan.status !== "done") {
    throw new PlanError(`cannot archive ${path.basename(filePath)} — status is '${plan.status}', expected 'done'`);
  }
  const destination = movePlan(filePath, cfg.archiveDir);
  const relative = path.relative(cfg.root, destination);
  const shown = relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : destination;
  writeOut(`archived: ${shown}\n`);
  return 0;
}

function cmdConfig(cfg) {
  for (const [key, value] of Object.entries(cfg.asDict())) {
    writeOut(`${key}: ${pyRepr(value)}\n`);
  }
  return 0;
}

// ── Entry point ──────────────────────────────────────────────────────

const SPEC = {
  description: "Deterministic tech-plan operations for the spec-* workflow skills.",
  subcommands: {
    "next-number": { description: "print the next free plan number", options: {}, positionals: [] },
    list: {
      description: "list plans",
      options: { status: { type: "string", default: "all", description: "only plans in this status" } },
      positionals: [],
    },
    show: { description: "show plan metadata", options: {}, positionals: [{ name: "ref" }] },
    checklist: { description: "show remaining checklist items", options: {}, positionals: [{ name: "ref" }] },
    validate: {
      description: "validate a plan",
      options: { strict: { type: "boolean", description: "fail when the checklist is incomplete" } },
      positionals: [{ name: "ref" }],
    },
    "validate-for": {
      description: "check the gate for a workflow phase",
      options: {},
      positionals: [{ name: "phase", choices: ["implement", "review", "close"] }, { name: "ref" }],
    },
    "set-status": {
      description: "move a plan to another status",
      options: {},
      positionals: [{ name: "ref" }, { name: "status" }],
    },
    archive: { description: "archive a done plan", options: {}, positionals: [{ name: "ref" }] },
    config: { description: "print the resolved configuration", options: {}, positionals: [] },
  },
};

function main(argv) {
  let values;
  try {
    values = parseArgs(argv, SPEC, { prog: PROG });
  } catch (error) {
    if (error instanceof Error && error.name === "UsageError") {
      failUsage(PROG, SPEC, error.message);
    }
    throw error;
  }

  try {
    const cfg = loadConfig();
    switch (values.command) {
      case "next-number":
        return cmdNextNumber(cfg);
      case "list":
        return cmdList(cfg, values);
      case "show":
        return cmdShow(cfg, values);
      case "checklist":
        return cmdChecklist(cfg, values);
      case "validate":
        return cmdValidate(cfg, values);
      case "validate-for":
        return cmdValidateFor(cfg, values);
      case "set-status":
        return cmdSetStatus(cfg, values);
      case "archive":
        return cmdArchive(cfg, values);
      case "config":
        return cmdConfig(cfg);
      default:
        return failUsage(PROG, SPEC, "a command is required");
    }
  } catch (error) {
    if (error instanceof PlanError) {
      writeErr(`ERROR: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

process.exit(main(process.argv.slice(2)));
