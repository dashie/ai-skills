import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { isDir } from "./fsx.mjs";

/**
 * The location block Copilot reads from `permissions-config.json` to skip the
 * per-command prompt: one `aispec:*` shell approval plus the skills directory as an
 * allowed path.
 *
 * The approval names the dispatcher, not `node`: approving `node` would approve every
 * node script, while `aispec` reaches only the skill scripts. The older `node:*`
 * identifier is dropped when present, so re-approving narrows an existing entry.
 */
export const AISPEC_RULE = Object.freeze({ kind: "commands", commandIdentifiers: ["aispec:*"] });
const SUPERSEDED_IDENTIFIERS = ["node:*"];

/** Drop identifiers this skill no longer grants, keeping the rest of the rule intact. */
function withoutSuperseded(rule) {
  if (!Array.isArray(rule.commandIdentifiers)) return rule;
  const kept = rule.commandIdentifiers.filter((identifier) => !SUPERSEDED_IDENTIFIERS.includes(identifier));
  return kept.length === rule.commandIdentifiers.length ? rule : { ...rule, commandIdentifiers: kept };
}

export class PermissionsError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionsError";
  }
}

export function copilotHome() {
  const fromEnv = process.env.COPILOT_HOME;
  return fromEnv && fromEnv.trim() ? path.resolve(fromEnv) : path.join(os.homedir(), ".copilot");
}

export function permissionsConfigPath() {
  return path.join(copilotHome(), "permissions-config.json");
}

/** The skills checkout and the user-level install, whichever exist, without duplicates. */
export function defaultSkillsDirectories(skillsRoot, extras = []) {
  const dirs = [];
  const add = (dir) => {
    if (!dir) return;
    const resolved = path.normalize(path.resolve(dir));
    if (!dirs.includes(resolved)) dirs.push(resolved);
  };
  add(skillsRoot);
  add(path.join(copilotHome(), "skills"));
  for (const dir of extras) add(dir);
  return dirs.filter((dir) => isDir(dir));
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  const text = (result.stdout || "").trim();
  return text ? text : null;
}

/**
 * The key Copilot uses for a location: the main repository root (a worktree
 * resolves to its main checkout), or the directory itself outside Git.
 */
export function locationKey(dir) {
  const toplevel = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!toplevel) return path.normalize(path.resolve(dir));
  const commonDir = git(dir, ["rev-parse", "--git-common-dir"]);
  if (commonDir && path.isAbsolute(commonDir)) return path.normalize(path.dirname(commonDir));
  return path.normalize(toplevel);
}

export function readPermissionsConfig(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new PermissionsError(`${file} is not valid JSON (${error.message})`);
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function writePermissionsConfig(file, config) {
  const text = `${JSON.stringify(config, null, 2)}\n`;
  const temporary = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, file);
}

function locationOf(config, key) {
  config.locations = config.locations && typeof config.locations === "object" ? config.locations : {};
  config.locations[key] = config.locations[key] && typeof config.locations[key] === "object" ? config.locations[key] : {};
  return config.locations[key];
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

/** Add the skills approvals for `dir`, merging into whatever the file already holds. */
export function approveSkills({ dir, configPath = permissionsConfigPath(), skillsDirs, dryRun = false }) {
  const key = locationKey(dir);
  const config = readPermissionsConfig(configPath);
  const before = JSON.parse(JSON.stringify(config));

  const location = locationOf(config, key);
  const approvals = (Array.isArray(location.tool_approvals) ? location.tool_approvals : [])
    .map(withoutSuperseded)
    .filter((entry) => !Array.isArray(entry.commandIdentifiers) || entry.commandIdentifiers.length > 0);
  if (!approvals.some((entry) => sameValue(entry, AISPEC_RULE))) approvals.push({ ...AISPEC_RULE });
  location.tool_approvals = approvals;

  const allowed = Array.isArray(location.allowed_directories) ? location.allowed_directories : [];
  for (const allowedDir of skillsDirs) if (!allowed.includes(allowedDir)) allowed.push(allowedDir);
  location.allowed_directories = allowed;

  const changed = JSON.stringify(before) !== JSON.stringify(config);
  if (changed && !dryRun) writePermissionsConfig(configPath, config);
  return { file: configPath, key, dirs: skillsDirs, changed, config };
}

/** Take the skills approvals back out of `dir`'s location, leaving the rest alone. */
export function revokeSkills({ dir, configPath = permissionsConfigPath(), skillsDirs, dryRun = false }) {
  const key = locationKey(dir);
  const config = readPermissionsConfig(configPath);
  const location = config.locations && config.locations[key];
  if (!location) return { file: configPath, key, dirs: skillsDirs, changed: false, config };

  const before = JSON.parse(JSON.stringify(config));
  if (Array.isArray(location.tool_approvals)) {
    location.tool_approvals = location.tool_approvals
      .filter((entry) => !sameValue(entry, AISPEC_RULE))
      .map(withoutSuperseded)
      .filter((entry) => !Array.isArray(entry.commandIdentifiers) || entry.commandIdentifiers.length > 0);
    if (location.tool_approvals.length === 0) delete location.tool_approvals;
  }
  if (Array.isArray(location.allowed_directories)) {
    location.allowed_directories = location.allowed_directories.filter((allowed) => !skillsDirs.includes(allowed));
    if (location.allowed_directories.length === 0) delete location.allowed_directories;
  }
  if (Object.keys(location).length === 0) delete config.locations[key];
  if (config.locations && Object.keys(config.locations).length === 0) delete config.locations;

  const changed = JSON.stringify(before) !== JSON.stringify(config);
  if (changed && !dryRun) writePermissionsConfig(configPath, config);
  return { file: configPath, key, dirs: skillsDirs, changed, config };
}
