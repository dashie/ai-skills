#!/usr/bin/env node
/**
 * Render the AI-ready project scaffold from the skill templates.
 *
 * Deterministic by design: the same values file always produces the same bytes.
 * Templates live in assets/templates and are never generated at runtime.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { failUsage, parseArgs, requireOptions } from "../../lib/cli.mjs";
import { exists, isDir, isMainModule, readText, writeText } from "../../lib/fsx.mjs";
import {
  TemplateError,
  collectPlaceholders,
  composeGitignore,
  loadValues,
  mergeSettings,
  missingValues,
  readTemplate,
  substitute,
} from "../../lib/template.mjs";
import { padEnd, writeErr, writeOut } from "../../lib/text.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.dirname(SCRIPT_DIR);
export const TEMPLATE_ROOT = path.join(SKILL_ROOT, "assets", "templates");
const GITIGNORE_ROOT = path.join(TEMPLATE_ROOT, "gitignore");

export const SETTINGS_TEMPLATE = ".vscode/settings.json";
export const SETTINGS_DESTINATION = ".vscode/settings.json";
export const GITIGNORE_VARIANTS = ["generic", "node", "python", "go", "rust", "java"];

// template path (relative to assets/templates) -> destination path
const TARGETS = [
  ["README.md", "README.md"],
  ["CONTRIBUTING.md", "CONTRIBUTING.md"],
  ["AGENTS.md", "AGENTS.md"],
  ["CLAUDE.md", "CLAUDE.md"],
  [".github/copilot-commit-message-instructions.md", ".github/copilot-commit-message-instructions.md"],
  [".github/copilot-pull-request-instructions.md", ".github/copilot-pull-request-instructions.md"],
  ["docs/PRODUCT.md", "docs/PRODUCT.md"],
  ["docs/USER-GUIDE.md", "docs/USER-GUIDE.md"],
  ["docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
  ["docs/ADR.md", "docs/ADR.md"],
  ["docs/GLOSSARY.md", "docs/GLOSSARY.md"],
  ["docs/DEVELOPER-GUIDE.md", "docs/DEVELOPER-GUIDE.md"],
];

/** Placeholder name -> templates that use it. */
function buildVariableMap() {
  const usage = new Map();
  for (const [relativePath] of TARGETS) {
    for (const name of collectPlaceholders(readTemplate(TEMPLATE_ROOT, relativePath))) {
      if (!usage.has(name)) usage.set(name, []);
      usage.get(name).push(relativePath);
    }
  }
  return usage;
}

function render(templateRel, values, usage) {
  const template = readTemplate(TEMPLATE_ROOT, templateRel);
  const missing = missingValues(collectPlaceholders(template), values, usage);
  if (missing) throw new TemplateError(`missing values for ${templateRel}: ${missing}`);
  return substitute(template, values, templateRel);
}

function renderGitignore(variant) {
  if (!GITIGNORE_VARIANTS.includes(variant)) {
    throw new TemplateError(`unknown gitignore variant '${variant}' (choose from ${GITIGNORE_VARIANTS.join(", ")})`);
  }
  const common = readText(path.join(GITIGNORE_ROOT, "_common.gitignore"));
  if (variant === "generic") return composeGitignore({ variant, common });
  const specific = readText(path.join(GITIGNORE_ROOT, `${variant}.gitignore`));
  return composeGitignore({ variant, common, specific });
}

/** Merge the settings template into an existing editor settings file. */
export function renderSettings(destRoot, dryRun) {
  return mergeSettings({
    templateText: readText(path.join(TEMPLATE_ROOT, SETTINGS_TEMPLATE)),
    targetPath: path.join(destRoot, SETTINGS_DESTINATION),
    dryRun,
  });
}

const PROG = "scaffold.mjs";

const SPEC = {
  description: "Render the AI-ready project documentation scaffold.",
  options: {
    dest: { type: "string", description: "destination directory (created if missing)" },
    values: { type: "string", description: "JSON file with one value per placeholder" },
    gitignore: {
      type: "string",
      default: "generic",
      description: `gitignore variant: ${GITIGNORE_VARIANTS.join(", ")} (default: generic)`,
    },
    force: { type: "boolean", description: "overwrite existing files" },
    "dry-run": { type: "boolean", description: "report the planned writes only" },
    "list-variables": { type: "boolean", description: "print every placeholder and the templates that use it" },
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

  const usage = buildVariableMap();

  if (values["list-variables"]) {
    for (const name of [...usage.keys()].sort()) {
      writeOut(`${padEnd(name, 32)} ${usage.get(name).join(", ")}\n`);
    }
    return 0;
  }

  requireOptions(PROG, SPEC, values, ["dest", "values"]);

  const valueMap = loadValues(values.values);
  const unknown = [...new Set(Object.keys(valueMap))].filter((key) => !usage.has(key)).sort();
  if (unknown.length) {
    writeErr(`warning: unused values (not referenced by any template): ${unknown.join(", ")}\n`);
  }

  const rendered = TARGETS.map(([templateRel, destination]) => [destination, render(templateRel, valueMap, usage)]);
  rendered.push([".gitignore", renderGitignore(values.gitignore)]);

  const destRoot = path.resolve(values.dest);
  if (exists(destRoot) && !isDir(destRoot)) {
    throw new TemplateError(`destination is not a directory: ${destRoot}`);
  }

  const existing = rendered
    .map(([destination]) => path.join(destRoot, destination))
    .filter((target) => exists(target));
  if (existing.length && !values.force) {
    throw new TemplateError(
      `refusing to overwrite existing files (use --force only with user approval):\n  ${existing.join("\n  ")}`,
    );
  }

  for (const [destination, content] of rendered) {
    const target = path.join(destRoot, destination);
    if (values["dry-run"]) {
      writeOut(`would write ${target} (${Buffer.byteLength(content, "utf8")} bytes)\n`);
      continue;
    }
    writeText(target, content);
    writeOut(`wrote ${target}\n`);
  }

  writeOut(`${renderSettings(destRoot, values["dry-run"])} ${SETTINGS_DESTINATION}\n`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof TemplateError) {
      writeErr(`error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
