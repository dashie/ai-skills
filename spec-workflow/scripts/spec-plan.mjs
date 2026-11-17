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
 *   validate-for {implement|review|close} REF [--strict]
 *   fingerprint
 *   set-status REF STATUS
 *   archive REF
 *   config
 *
 * REF is a plan number (007), a number plus slug (007-my-feature), or a path.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
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
    versionFile: raw["version.file"] ? asPath(base, raw["version.file"]) : null,
    versionField: String(raw["version.field"] || "").trim(),
    versionBump: String(raw["version.bump"] || "plan").trim().toLowerCase(),
    changelogFile: raw["docs.changelog"] ? asPath(base, raw["docs.changelog"]) : null,
    backlogFile: raw["docs.backlog"] ? asPath(base, raw["docs.backlog"]) : null,
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
        version_file: this.versionFile,
        version_field: this.versionField,
        version_bump: this.versionBump,
        changelog: this.changelogFile,
        backlog: this.backlogFile,
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
    warnings.push("version_bump is not set (close cannot determine the version increment)");
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

const REVIEWED_STATE_RE = /\*\*Reviewed state\*\*:\s*`?([0-9a-f]{64})`?/gi;

/** Hash of every tracked/untracked non-ignored file outside the plan directories, or null without git. */
function computeFingerprint(cfg) {
  let listing;
  try {
    listing = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: cfg.root,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    }).toString("utf8");
  } catch {
    return null;
  }
  const skip = [cfg.planDir, cfg.draftDir, cfg.archiveDir].filter(Boolean).map((dir) => path.resolve(dir));
  const hash = crypto.createHash("sha256");
  for (const rel of [...new Set(listing.split("\0").filter(Boolean))].sort()) {
    const absolute = path.resolve(cfg.root, rel);
    if (skip.some((dir) => absolute === dir || absolute.startsWith(dir + path.sep))) continue;
    let content;
    try {
      content = fs.readFileSync(absolute);
    } catch {
      continue;
    }
    hash.update(`${rel}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest("hex");
}

function cmdFingerprint(cfg) {
  const value = computeFingerprint(cfg);
  if (value === null) {
    writeErr("ERROR: fingerprint needs a git repository\n");
    return 1;
  }
  writeOut(`${value}\n`);
  return 0;
}

function validateFor(cfg, plan, phase, strict = false) {
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
    const recorded = matchAll(REVIEWED_STATE_RE, plan.text).map((match) => match[1].toLowerCase());
    const current = computeFingerprint(cfg);
    if (current !== null) {
      if (!recorded.length) {
        writeOut("WARN: latest review records no '**Reviewed state**'; cannot confirm the code is unchanged since the review\n");
      } else if (recorded[recorded.length - 1] !== current) {
        writeErr("ERROR: cannot close — the working tree changed since the review (Reviewed state mismatch); run a fresh spec-review\n");
        return 1;
      }
    }
  }

  if (phase === "implement") {
    const problems = unmetDependencies(cfg, plan);
    if (problems.length) {
      for (const problem of problems) writeErr(`ERROR: ${problem}\n`);
      return 1;
    }
  }

  const { errors, warnings } = collectValidation(cfg, plan, strict);
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
  return validateFor(cfg, loadPlan(resolveRef(cfg, values.ref)), values.phase, values.strict === true);
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

function bumpSemver(version, increment) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) {
    throw new PlanError(`unsupported version '${version}' (expected MAJOR.MINOR.PATCH without a suffix)`);
  }
  let [, major, minor, patch] = match;
  if (increment === "major") {
    major = String(BigInt(major) + 1n);
    minor = "0";
    patch = "0";
  } else if (increment === "minor") {
    minor = String(BigInt(minor) + 1n);
    patch = "0";
  } else {
    patch = String(BigInt(patch) + 1n);
  }
  return `${major}.${minor}.${patch}`;
}

function changeConfiguredVersion(cfg, plan) {
  const planBump = String(plan.meta.version_bump || "").trim().toLowerCase();
  const bump = cfg.versionBump === "plan" ? planBump : cfg.versionBump;
  if (!KNOWN_BUMPS.has(bump)) {
    throw new PlanError(`cannot determine version bump (plan: '${planBump || "unset"}', profile: '${cfg.versionBump}')`);
  }
  if (bump === "none") return { oldVersion: null, newVersion: null, text: null };
  if (!cfg.versionFile) {
    throw new PlanError("version bump is required but version.file is not configured in .spec-workflow.yml");
  }
  if (!isFile(cfg.versionFile)) {
    throw new PlanError(`configured version file not found: ${cfg.versionFile}`);
  }

  const resolvedVersionFile = realpath(cfg.versionFile);
  const relative = path.relative(realpath(cfg.root), resolvedVersionFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PlanError("version.file must resolve inside the repository root");
  }
  const original = readText(resolvedVersionFile);
  let oldVersion;
  let updated;
  if (path.extname(cfg.versionFile).toLowerCase() === ".json") {
    let data;
    try {
      data = JSON.parse(original);
    } catch {
      throw new PlanError(`configured version file is not valid JSON: ${cfg.versionFile}`);
    }
    const keys = cfg.versionField.split(".").filter(Boolean);
    if (!keys.length) throw new PlanError("version.field is required for JSON version files");
    let owner = data;
    for (const key of keys.slice(0, -1)) {
      if (!owner || typeof owner !== "object" || !Object.hasOwn(owner, key)) {
        throw new PlanError(`version.field '${cfg.versionField}' was not found`);
      }
      owner = owner[key];
    }
    const leaf = keys[keys.length - 1];
    if (!owner || typeof owner !== "object" || typeof owner[leaf] !== "string") {
      throw new PlanError(`version.field '${cfg.versionField}' must identify a string`);
    }
    oldVersion = owner[leaf];
    owner[leaf] = bumpSemver(oldVersion, bump);
    const newline = original.endsWith("\n") ? "\n" : "";
    const indentMatch = /\n([ \t]+)"/.exec(original);
    const indent = original.includes("\n") ? Math.max(1, indentMatch?.[1].length || 2) : 0;
    updated = `${JSON.stringify(data, null, indent)}${newline}`;
  } else {
    const field = cfg.versionField;
    if (!field && (
      [".txt", ".version"].includes(path.extname(cfg.versionFile).toLowerCase()) ||
      path.basename(cfg.versionFile) === "VERSION"
    )) {
      oldVersion = original.trim();
      const newline = original.endsWith("\n") ? "\n" : "";
      updated = `${bumpSemver(oldVersion, bump)}${newline}`;
    } else {
      const parts = field.split(".");
      const key = parts.pop();
      if (!key) throw new PlanError("version.field is required for this version file");
      const section = parts.join(".");
      const lines = original.split("\n");
      let activeSection = !section;
      const matches = [];
      for (let index = 0; index < lines.length; index += 1) {
        const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(lines[index]);
        if (sectionMatch) {
          activeSection = sectionMatch[1].trim() === section;
          continue;
        }
        if (!activeSection) continue;
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const valueMatch = new RegExp(`^(\\s*${escaped}\\s*[:=]\\s*)(["']?)([^"'#\\s]+)\\2(\\s*(?:#.*)?)$`).exec(lines[index]);
        if (valueMatch) matches.push({ index, valueMatch });
      }
      if (matches.length !== 1) {
        throw new PlanError(`version.field '${field}' matched ${matches.length} entries in ${cfg.versionFile}; expected exactly one`);
      }
      const { index, valueMatch } = matches[0];
      oldVersion = valueMatch[3];
      lines[index] = `${valueMatch[1]}${valueMatch[2]}${bumpSemver(oldVersion, bump)}${valueMatch[2]}${valueMatch[4]}`;
      updated = lines.join("\n");
    }
  }
  return { oldVersion, newVersion: bumpSemver(oldVersion, bump), text: updated };
}

function getConfiguredDocument(filePath, root, name) {
  if (!filePath || !isFile(filePath)) return null;
  const resolved = realpath(filePath);
  const relative = path.relative(realpath(root), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PlanError(`${name} must resolve inside the repository root`);
  }
  return { path: resolved, text: readText(resolved) };
}

function changelogEntry(plan, archivePath, changelogPath, version) {
  const relativePlan = path.relative(path.dirname(changelogPath), archivePath).split(path.sep).join("/");
  const advisoryMatch = plan.meta.type === "security" ? /CVE-\d{4}-\d{4,}/i.exec(plan.text) : null;
  const description = `${plan.title} ([${plan.stem}](${relativePlan}))${advisoryMatch ? ` (${advisoryMatch[0].toUpperCase()})` : ""}`;
  const type = String(plan.meta.type || "").toLowerCase();
  const section = type === "feature" ? "Added" : type === "security" ? "Security" : type === "fix" ? "Fixed" : "Changed";
  return { description, section, version };
}

function updateChangelog(original, entry, date) {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  const unreleased = lines.findIndex((line) => /^##\s+\[?Unreleased\]?\s*$/i.test(line));
  if (entry.version && lines.some((line) => new RegExp(`^##\\s+\\[?${entry.version.replaceAll(".", "\\.")}(?:\\]|\\s|$)`).test(line))) {
    throw new PlanError(`changelog already has a section for version ${entry.version}`);
  }
  const bullet = `- ${entry.description}`;
  if (!entry.version) {
    if (unreleased === -1) throw new PlanError("changelog has no Unreleased section for a plan with version_bump: none");
    let end = unreleased + 1;
    while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
    let category = -1;
    for (let index = unreleased + 1; index < end; index += 1) {
      if (new RegExp(`^###\\s+${entry.section}\\s*$`, "i").test(lines[index])) {
        category = index;
        break;
      }
    }
    if (category !== -1) {
      let insertAt = category + 1;
      while (insertAt < end && !/^###\s+/.test(lines[insertAt])) insertAt += 1;
      lines.splice(insertAt, 0, bullet, "");
    } else {
      lines.splice(unreleased + 1, 0, "", `### ${entry.section}`, "", bullet, "");
    }
  } else {
    const block = [`## [${entry.version}] - ${date}`, "", `### ${entry.section}`, "", bullet, "", ""];
    let insertAt;
    if (unreleased !== -1) {
      insertAt = unreleased + 1;
      while (insertAt < lines.length && !/^##\s+/.test(lines[insertAt])) insertAt += 1;
    } else {
      insertAt = lines.findIndex((line) => /^##\s+/.test(line));
      if (insertAt === -1) insertAt = lines.length;
    }
    lines.splice(insertAt, 0, ...block);
  }
  return lines.join(eol);
}

function updateBacklog(original, plan, archivePath, backlogPath, version) {
  const lines = original.split(/\r?\n/);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(plan.stem)) matches.push(index);
  }
  if (matches.length !== 1) {
    throw new PlanError(`backlog must contain exactly one item linked to '${plan.stem}' (found ${matches.length})`);
  }
  const index = matches[0];
  const relativePlan = path.relative(path.dirname(backlogPath), archivePath).split(path.sep).join("/");
  let line = lines[index].replace(/^(\s*[-*]\s+\[)\s*(\])/, "$1x$2");
  if (!line.includes(relativePlan)) {
    line += ` — Delivered${version ? ` in ${version}` : ""} ([plan](${relativePlan}))`;
  } else if (version && !line.includes(version)) {
    line += ` — Delivered in ${version}`;
  }
  lines[index] = line;
  return lines.join(original.includes("\r\n") ? "\r\n" : "\n");
}

function cmdClose(cfg, values) {
  const filePath = resolveRef(cfg, values.ref);
  const plan = loadPlan(filePath);
  if (validateFor(cfg, plan, "close") !== 0) return 1;
  const items = checklistItems(plan.text);
  if (!items.length || items.some((item) => !item.checked)) {
    throw new PlanError(`cannot close ${path.basename(filePath)} — implementation checklist is incomplete`);
  }
  if (!FRONTMATTER_RE.test(plan.text) || !STATUS_LINE_RE.test(plan.text)) {
    throw new PlanError(`${path.basename(filePath)} has no editable status field`);
  }
  const destination = path.join(cfg.archiveDir, path.basename(filePath));
  if (realpath(destination) !== realpath(filePath) && fs.existsSync(destination)) {
    throw new PlanError(`cannot archive ${path.basename(filePath)}: ${destination} already exists`);
  }

  const version = changeConfiguredVersion(cfg, plan);
  const closeDate = values.date || new Date().toISOString().slice(0, 10);
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(closeDate) ? new Date(`${closeDate}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== closeDate) {
    throw new PlanError(`invalid close date '${closeDate}' (expected YYYY-MM-DD)`);
  }
  const changelog = getConfiguredDocument(cfg.changelogFile, cfg.root, "docs.changelog");
  const backlog = getConfiguredDocument(cfg.backlogFile, cfg.root, "docs.backlog");
  const entry = changelogEntry(plan, destination, changelog?.path || "", version.newVersion);
  const changelogText = changelog ? updateChangelog(changelog.text, entry, closeDate) : null;
  const backlogText = backlog
    ? updateBacklog(backlog.text, plan, destination, backlog.path, version.newVersion)
    : null;
  const targets = [
    ...(version.text === null ? [] : [realpath(cfg.versionFile)]),
    ...(changelog ? [changelog.path] : []),
    ...(backlog ? [backlog.path] : []),
    realpath(filePath),
  ];
  if (new Set(targets).size !== targets.length) {
    throw new PlanError("version, changelog, backlog, and plan paths must be distinct");
  }

  const completed = plan.text.replace(STATUS_LINE_RE, (_match, prefix) => `${prefix}done`);
  const writes = [
    ...(version.text === null ? [] : [[cfg.versionFile, version.text]]),
    ...(changelogText === null ? [] : [[changelog.path, changelogText]]),
    ...(backlogText === null ? [] : [[backlog.path, backlogText]]),
    [filePath, completed],
  ];
  const originals = writes.map(([target]) => readText(target));
  let archived;
  try {
    for (const [target, text] of writes) writeText(target, text);
    archived = movePlan(filePath, cfg.archiveDir);
  } catch (error) {
    writes.forEach(([target], index) => writeText(target, originals[index]));
    throw error;
  }
  const relative = path.relative(cfg.root, archived);
  const shown = relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : archived;
  if (version.text === null) {
    writeOut("version: unchanged (version_bump: none)\n");
  } else {
    writeOut(`version: ${version.oldVersion} → ${version.newVersion}\n`);
  }
  writeOut(`changelog: ${changelog ? "updated" : "n/a"}\n`);
  writeOut(`backlog: ${backlog ? "updated" : "n/a"}\n`);
  writeOut(`closed: ${shown}\n`);
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
      options: { strict: { type: "boolean", description: "also require a fully ticked checklist" } },
      positionals: [{ name: "phase", choices: ["implement", "review", "close"] }, { name: "ref" }],
    },
    "set-status": {
      description: "move a plan to another status",
      options: {},
      positionals: [{ name: "ref" }, { name: "status" }],
    },
    archive: { description: "archive a done plan", options: {}, positionals: [{ name: "ref" }] },
    close: {
      description: "bump the version, update configured records, and archive a reviewed plan",
      options: { date: { type: "string", description: "release date (YYYY-MM-DD)" } },
      positionals: [{ name: "ref" }],
    },
    fingerprint: { description: "print the hash of the current code state (git)", options: {}, positionals: [] },
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
      case "close":
        return cmdClose(cfg, values);
      case "fingerprint":
        return cmdFingerprint(cfg);
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
