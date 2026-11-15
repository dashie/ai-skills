#!/usr/bin/env node
/**
 * Render the AI dev-container sandbox into a repository.
 *
 * Deterministic: templates are copied and placeholders substituted. Idempotent: doc
 * snippets are appended between markers only when the markers are absent.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { failUsage, parseArgs, requireOptions } from "../../lib/cli.mjs";
import { exists, isDir, isFile, listDir, readText, writeText } from "../../lib/fsx.mjs";
import {
  TemplateError,
  collectPlaceholders,
  loadValues,
  missingValues,
  readTemplate,
  substitute,
} from "../../lib/template.mjs";
import { padEnd, pyJsonDumps, writeErr, writeOut } from "../../lib/text.mjs";
import {
  APPEND_TARGETS,
  BEGIN_MARKER,
  END_MARKER,
  GITIGNORE_ENTRY,
  TARGETS,
} from "./sandbox-layout.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const TEMPLATE_ROOT = path.join(SKILL_ROOT, "assets", "templates");
const SNIPPET_ROOT = path.join(SKILL_ROOT, "assets", "snippets");

// Optional keys accepted in the values file but not present in any template.
const OPTIONAL_KEYS = new Set(["MODEL_PROVIDER_EXTENSIONS"]);

// Keys whose value is a JSON array, not plain text.
const JSON_KEYS = ["VSCODE_EXTENSIONS", "FORWARD_PORTS", "MODEL_PROVIDER_EXTENSIONS"];

// Host extension directories scanned by --detect-model-providers.
const EXTENSION_DIRS = [
  "~/.vscode/extensions",
  "~/.vscode-insiders/extensions",
  "~/.vscode-server/extensions",
  "~/.vscode-remote/extensions",
];

function write(target, content, mode = 0o644) {
  writeText(target, content, mode);
}

function buildVariableMap() {
  const usage = new Map();
  for (const [name] of TARGETS) {
    // One entry per occurrence, matching the printed contract of the Python script.
    const occurrences = [...readTemplate(TEMPLATE_ROOT, name).matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(
      (match) => match[1],
    );
    for (const key of occurrences) {
      if (!usage.has(key)) usage.set(key, []);
      usage.get(key).push(name);
    }
  }
  return usage;
}

function parseExtensionIds(raw, key) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TemplateError(`${key} must be a JSON array of extension ids, e.g. ["ms-python.python"]`);
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string" && item.trim())) {
    throw new TemplateError(`${key} must be a JSON array of non-empty extension ids, e.g. ["ms-python.python"]`);
  }
  return parsed.map((item) => item.trim());
}

/** Fold MODEL_PROVIDER_EXTENSIONS into VSCODE_EXTENSIONS. */
function mergeModelProviders(values) {
  const raw = values.MODEL_PROVIDER_EXTENSIONS;
  delete values.MODEL_PROVIDER_EXTENSIONS;
  if (raw === undefined) return;
  const providers = parseExtensionIds(raw, "MODEL_PROVIDER_EXTENSIONS");
  if (!providers.length) return;
  if (!Object.hasOwn(values, "VSCODE_EXTENSIONS")) {
    throw new TemplateError("MODEL_PROVIDER_EXTENSIONS requires VSCODE_EXTENSIONS in the values file");
  }
  const extensions = parseExtensionIds(values.VSCODE_EXTENSIONS, "VSCODE_EXTENSIONS");
  const seen = new Set(extensions.map((item) => item.toLowerCase()));
  for (const provider of providers) {
    if (!seen.has(provider.toLowerCase())) {
      extensions.push(provider);
      seen.add(provider.toLowerCase());
    }
  }
  values.VSCODE_EXTENSIONS = pyJsonDumps(extensions);
}

/** Ids of the installed extensions that add Copilot Chat models. */
function collectModelProviders(extraDirs) {
  const found = [];
  const seen = new Set();
  for (const directory of [...EXTENSION_DIRS, ...(extraDirs || [])]) {
    const expanded = directory.startsWith("~") ? path.join(os.homedir(), directory.slice(1)) : directory;
    if (!isDir(expanded)) continue;
    const candidates = listDir(expanded)
      .map((name) => path.join(expanded, name, "package.json"))
      .filter((candidate) => isFile(candidate));
    for (const candidate of candidates) {
      let manifest;
      try {
        manifest = JSON.parse(readText(candidate));
      } catch {
        continue;
      }
      const providers = manifest?.contributes?.languageModelChatProviders;
      const publisher = manifest?.publisher;
      const name = manifest?.name;
      if (!providers || !publisher || !name) continue;
      const extensionId = `${publisher}.${name}`;
      if (seen.has(extensionId.toLowerCase())) continue;
      seen.add(extensionId.toLowerCase());
      found.push(extensionId);
    }
  }
  return found;
}

function warnMissingModelProviders(values) {
  const installed = new Set(
    parseExtensionIds(values.VSCODE_EXTENSIONS || "[]", "VSCODE_EXTENSIONS").map((item) => item.toLowerCase()),
  );
  const missing = collectModelProviders(null).filter((item) => !installed.has(item.toLowerCase()));
  if (missing.length) {
    writeErr(
      "warning: Copilot Chat model providers installed on the host are not in " +
        `VSCODE_EXTENSIONS: ${missing.join(", ")}\n` +
        "         pass them as MODEL_PROVIDER_EXTENSIONS, or their models stay " +
        "invisible inside the container\n",
    );
  }
}

function render(name, values, usage) {
  const template = readTemplate(TEMPLATE_ROOT, name);
  const missing = missingValues(collectPlaceholders(template), values, usage);
  if (missing) throw new TemplateError(`missing values for ${name}: ${missing}`);
  return substitute(template, values, name);
}

/** Append the snippet when its markers are absent. Returns a status string. */
function appendBlock(target, snippetName, heading, values, dryRun) {
  const prefixFor = (existing) => {
    const body = existing.replace(/\n+$/, "");
    // Existing document: append only, never add a second title.
    if (body) return `${body}\n\n`;
    return `${heading.replace("{project}", values.PROJECT_NAME)}\n\n`;
  };

  let prefix;
  let mode;
  if (exists(target)) {
    const content = readText(target);
    if (content.includes(BEGIN_MARKER)) return "unchanged";
    if (content.includes(END_MARKER)) {
      throw new TemplateError(`${target} contains the end marker without the begin marker; fix it by hand`);
    }
    prefix = prefixFor(content);
    mode = fs.statSync(target).mode & 0o777;
  } else {
    prefix = prefixFor("");
    mode = 0o644;
  }

  const snippet = `${readText(path.join(SNIPPET_ROOT, snippetName)).replace(/\n+$/, "")}\n`;
  if (dryRun) return "would append";
  write(target, prefix + snippet, mode);
  return "appended";
}

function ensureGitignore(root, dryRun) {
  const target = path.join(root, ".gitignore");
  const entry = GITIGNORE_ENTRY;
  if (exists(target)) {
    const content = readText(target);
    if (content.split("\n").some((line) => line.trim() === entry)) return "unchanged";
    let updated = content;
    if (!updated.endsWith("\n")) updated += "\n";
    updated += `\n# AI sandbox run logs\n${entry}\n`;
    if (!dryRun) write(target, updated, fs.statSync(target).mode & 0o777);
    return "updated";
  }
  if (!dryRun) write(target, `# AI sandbox run logs\n${entry}\n`);
  return "created";
}

const PROG = "scaffold-sandbox.mjs";

const SPEC = {
  description: "Render the AI dev-container sandbox.",
  options: {
    dest: { type: "string", description: "repository root" },
    values: { type: "string", description: "JSON file with one value per placeholder" },
    force: { type: "boolean", description: "overwrite existing files" },
    "dry-run": { type: "boolean", description: "report, do not write" },
    "list-variables": { type: "boolean", description: "print the placeholder contract" },
    "detect-model-providers": {
      type: "boolean",
      description: "print a JSON array of installed Copilot Chat model-provider extension ids",
    },
    "extensions-dir": {
      type: "string",
      repeatable: true,
      description: "extra extension directory to scan with --detect-model-providers (repeatable)",
    },
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

  if (values["detect-model-providers"]) {
    writeOut(`${pyJsonDumps(collectModelProviders(values["extensions-dir"]))}\n`);
    return 0;
  }

  const usage = buildVariableMap();

  if (values["list-variables"]) {
    for (const key of [...usage.keys()].sort()) {
      writeOut(`${padEnd(key, 24)} ${usage.get(key).join(", ")}\n`);
    }
    for (const key of [...OPTIONAL_KEYS].sort()) {
      writeOut(`${padEnd(key, 24)} (optional) merged into VSCODE_EXTENSIONS\n`);
    }
    return 0;
  }

  requireOptions(PROG, SPEC, values, ["dest", "values"]);

  const valueMap = loadValues(values.values, { jsonKeys: JSON_KEYS });
  const unknown = Object.keys(valueMap)
    .filter((key) => !usage.has(key) && !OPTIONAL_KEYS.has(key))
    .sort();
  if (unknown.length) writeErr(`warning: unused values: ${unknown.join(", ")}\n`);

  const fileKeys = new Set(Object.keys(valueMap));
  mergeModelProviders(valueMap);
  if (!fileKeys.has("MODEL_PROVIDER_EXTENSIONS")) warnMissingModelProviders(valueMap);

  const root = path.resolve(values.dest);
  if (exists(root) && !isDir(root)) throw new TemplateError(`destination is not a directory: ${root}`);

  const rendered = TARGETS.map(([name, destination, executable]) => ({
    destination,
    content: render(name, valueMap, usage),
    executable,
  }));

  const existing = rendered.map((item) => path.join(root, item.destination)).filter((target) => exists(target));
  if (existing.length && !values.force) {
    throw new TemplateError(
      `refusing to overwrite existing files (use --force only with user approval):\n  ${existing.join("\n  ")}`,
    );
  }

  const dryRun = values["dry-run"] === true;
  for (const item of rendered) {
    const target = path.join(root, item.destination);
    if (dryRun) {
      writeOut(`would write ${target} (${Buffer.byteLength(item.content, "utf8")} bytes)\n`);
      continue;
    }
    write(target, item.content, item.executable ? 0o755 : 0o644);
    writeOut(`wrote ${target}\n`);
  }

  for (const [destination, snippetName, heading] of APPEND_TARGETS) {
    const status = appendBlock(path.join(root, destination), snippetName, heading, valueMap, dryRun);
    writeOut(`${status} ${destination}\n`);
  }

  const status = ensureGitignore(root, dryRun);
  writeOut(`${status} .gitignore (${GITIGNORE_ENTRY})\n`);
  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  if (error instanceof TemplateError) {
    writeErr(`error: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
