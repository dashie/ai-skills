#!/usr/bin/env node
/**
 * Verify a rendered scaffold: required files, no placeholders, working links,
 * and the fixed sections that must survive rendering.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { failUsage, parseArgs } from "../../lib/cli.mjs";
import { fileSize, isDir, isFile, listDir, readText } from "../../lib/fsx.mjs";
import {
  CODE_FENCE_RE,
  HEADING_LINE_RE,
  HTML_COMMENT_RE,
  PLACEHOLDER_RE,
  TABLE_ROW_RE,
  TABLE_SEPARATOR_RE,
  headingLevel,
  matchAll,
  relativeLinks,
} from "../../lib/markdown.mjs";
import { writeErr, writeOut } from "../../lib/text.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(path.dirname(SCRIPT_DIR), "assets", "templates");

const REQUIRED_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
  ".github/copilot-commit-message-instructions.md",
  ".github/copilot-pull-request-instructions.md",
  ".vscode/settings.json",
  "docs/PRODUCT.md",
  "docs/USER-GUIDE.md",
  "docs/ARCHITECTURE.md",
  "docs/ADR.md",
  "docs/GLOSSARY.md",
  "docs/DEVELOPER-GUIDE.md",
];

const FIXED_CONTENT = {
  "docs/DEVELOPER-GUIDE.md": [
    "## Git Standards",
    "Conventional Commits",
    "English",
    "agents never commit or push",
    "### Design rules",
    "ships with the tests of the part it changes",
    "### Commit messages",
    ".github/copilot-commit-message-instructions.md",
    "## AI skills",
    "aispec allow",
  ],
  "docs/USER-GUIDE.md": [
    "## How to use it",
    "## Configuration",
    "Keeping this guide current",
    "living document",
    "configuration option",
  ],
  "docs/ARCHITECTURE.md": [
    "### Architecture principles",
    "Simplicity first (KISS)",
    "Modular by default",
  ],
  "AGENTS.md": [
    "English only",
    "Conventional Commits",
    "docs/GLOSSARY.md",
    "Never commit or push",
    "## Engineering principles",
    "Simplicity first (KISS)",
    "Modularity and decoupling",
    "Tests ship with the change",
    "## AI skills",
    "aispec allow",
  ],
  "CONTRIBUTING.md": [
    "includes the tests of the code it touches",
    ".github/copilot-commit-message-instructions.md",
  ],
  ".github/copilot-commit-message-instructions.md": [
    "Conventional Commits",
    "<type>[optional scope][!]: <subject>",
    "BREAKING CHANGE:",
    "Co-authored-by:",
    "English",
  ],
  ".github/copilot-pull-request-instructions.md": [
    "Conventional Commits",
    "Closes #",
    "English",
  ],
  "CLAUDE.md": ["@AGENTS.md"],
};

const BLOCK_BEGIN_RE = /<!-- skill:block:([a-z0-9-]+)[^\n>]*-->/g;
const BLOCK_END_RE = /<!-- skill:end:([a-z0-9-]+) -->/g;

const USER_GUIDE_SUMMARY_HEADING = "## What it is";
const USER_GUIDE_SUMMARY_MAX_LINES = 3;

const GENERATOR_SETTINGS = {
  "github.copilot.chat.commitMessageGeneration.instructions": ".github/copilot-commit-message-instructions.md",
  "github.copilot.chat.pullRequestDescriptionGeneration.instructions":
    ".github/copilot-pull-request-instructions.md",
};

/** `{relative path: [block id, ...]}` declared by the templates. */
function templateBlockIds() {
  const names = listDir(TEMPLATES).filter((name) => name.endsWith(".md"));
  const docs = path.join(TEMPLATES, "docs");
  if (isDir(docs)) names.push(...listDir(docs).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`));
  const declared = {};
  for (const name of names) {
    const ids = [...readText(path.join(TEMPLATES, name)).matchAll(BLOCK_BEGIN_RE)].map((match) => match[1]);
    if (ids.length) declared[name] = ids;
  }
  return declared;
}

/**
 * Every Markdown table block needs a header separator row. Without it the renderer
 * emits the rows as literal pipes, which is how a headerless table slips through.
 */
function checkTables(name, text) {
  const problems = [];
  let inFence = false;
  let block = [];

  const flush = () => {
    if (block.length && !block.some(([, line]) => TABLE_SEPARATOR_RE.test(line))) {
      problems.push(
        `${name}:${block[0][0]}: table block has no header separator row ` +
          `(Markdown renders it as text): ${block[0][1].trim().slice(0, 60)}`,
      );
    }
    block = [];
  };

  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (CODE_FENCE_RE.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (TABLE_ROW_RE.test(line)) {
      block.push([index + 1, line]);
    } else {
      flush();
    }
  }
  flush();
  return problems;
}

/**
 * Lines of the section that starts at `heading`, comments removed. Returns null when
 * the heading is absent. The section ends at the next heading of the same or higher level.
 */
function sectionBody(text, heading) {
  const lines = text.replace(HTML_COMMENT_RE, "").split("\n");
  let start = -1;
  let level = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].replace(/\s+$/, "") === heading) {
      start = index;
      level = HEADING_LINE_RE.exec(heading)[1].length;
      break;
    }
  }
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    const current = headingLevel(line);
    if (current !== null && current <= level) break;
    body.push(line);
  }
  return body;
}

/**
 * `What it is` is one short paragraph, and the guide stands alone: it is distributed
 * on its own, so a link to another repository document would be broken.
 */
function checkUserGuide(name, text) {
  const problems = [];
  for (const target of relativeLinks(text)) {
    problems.push(
      `${name}: links to ${target}, but this guide is distributed on its own and must not ` +
        `reference other repository documents`,
    );
  }

  const body = sectionBody(text, USER_GUIDE_SUMMARY_HEADING);
  if (body === null) {
    problems.push(`${name}: missing ${USER_GUIDE_SUMMARY_HEADING} section`);
    return problems;
  }

  const paragraphs = [];
  let current = [];
  let inFence = false;
  for (const line of body) {
    if (CODE_FENCE_RE.test(line)) {
      inFence = !inFence;
    } else if (!inFence && !line.trim()) {
      if (current.length) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) paragraphs.push(current);

  if (paragraphs.length !== 1) {
    problems.push(`${name}: ${USER_GUIDE_SUMMARY_HEADING} must be a single paragraph (found ${paragraphs.length})`);
    return problems;
  }
  if (paragraphs[0].length > USER_GUIDE_SUMMARY_MAX_LINES) {
    problems.push(
      `${name}: the summary under ${USER_GUIDE_SUMMARY_HEADING} is ${paragraphs[0].length} lines long, ` +
        `the maximum is ${USER_GUIDE_SUMMARY_MAX_LINES}`,
    );
  }
  return problems;
}

/**
 * The two generator settings must exist and point at files that exist. A setting the
 * project deliberately rewired is a warning, not a failure.
 */
function checkSettings(root) {
  const errors = [];
  const warnings = [];
  const settingsPath = path.join(root, ".vscode/settings.json");
  if (!isFile(settingsPath)) return { errors, warnings };

  let settings;
  try {
    settings = JSON.parse(readText(settingsPath));
  } catch {
    warnings.push(".vscode/settings.json is not plain JSON (comments?), generator settings not verified");
    return { errors, warnings };
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    errors.push(".vscode/settings.json is not a JSON object");
    return { errors, warnings };
  }

  for (const [key, expected] of Object.entries(GENERATOR_SETTINGS)) {
    const entries = settings[key];
    if (entries === undefined) {
      errors.push(`.vscode/settings.json is missing ${key}`);
      continue;
    }
    if (!Array.isArray(entries)) {
      errors.push(`${key} must be an array of {file} or {text} objects`);
      continue;
    }
    const files = entries
      .filter((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => entry.file);
    if (!files.includes(expected)) {
      warnings.push(`${key} does not reference ${expected}; the generated standard is not active`);
    }
    for (const relative of files) {
      if (relative && !isFile(path.join(root, relative))) {
        errors.push(`${key} references a missing file: ${relative}`);
      }
    }
  }
  return { errors, warnings };
}

const PROG = "check-output.mjs";

const SPEC = {
  description: "Verify a rendered scaffold.",
  options: { dest: { type: "string", required: true, description: "scaffold directory" } },
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
  const problems = [];

  for (const name of REQUIRED_FILES) {
    const target = path.join(root, name);
    if (!isFile(target)) {
      problems.push(`missing file: ${name}`);
    } else if (fileSize(target) === 0) {
      problems.push(`empty file: ${name}`);
    }
  }

  for (const name of REQUIRED_FILES) {
    const target = path.join(root, name);
    if (!isFile(target)) continue;
    const text = readText(target);
    for (const match of matchAll(PLACEHOLDER_RE, text)) {
      problems.push(`unresolved placeholder ${match[1]} in ${name}`);
    }
    if (name.endsWith(".md")) {
      problems.push(...checkTables(name, text));
      for (const link of relativeLinks(text)) {
        const resolved = path.normalize(path.join(path.dirname(target), link));
        if (!isFile(resolved) && !isDir(resolved)) problems.push(`broken link ${link} in ${name}`);
      }
    }
    if (name === "docs/USER-GUIDE.md") problems.push(...checkUserGuide(name, text));
    for (const needle of FIXED_CONTENT[name] || []) {
      if (!text.includes(needle)) problems.push(`missing fixed content '${needle}' in ${name}`);
    }
  }

  for (const [name, blockIds] of Object.entries(templateBlockIds())) {
    const target = path.join(root, name);
    if (!isFile(target)) continue;
    const text = readText(target);
    const begins = matchAll(BLOCK_BEGIN_RE, text).map((match) => match[1]);
    const ends = matchAll(BLOCK_END_RE, text).map((match) => match[1]);
    for (const blockId of blockIds) {
      if (!begins.includes(blockId)) problems.push(`missing managed block begin ${blockId} in ${name}`);
      if (!ends.includes(blockId)) problems.push(`missing managed block end ${blockId} in ${name}`);
    }
    for (const blockId of [...new Set(begins)].filter((id) => !ends.includes(id)).sort()) {
      problems.push(`unclosed managed block ${blockId} in ${name}`);
    }
    for (const blockId of [...new Set(ends)].filter((id) => !begins.includes(id)).sort()) {
      problems.push(`orphan managed block end ${blockId} in ${name}`);
    }
  }

  const settings = checkSettings(root);
  problems.push(...settings.errors);
  for (const warning of settings.warnings) writeErr(`warning: ${warning}\n`);

  if (problems.length) {
    for (const problem of problems) writeErr(`error: ${problem}\n`);
    return 1;
  }

  writeOut(`scaffold OK: ${REQUIRED_FILES.length} files verified in ${root}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
