#!/usr/bin/env node
/**
 * Remove the AI dev-container sandbox from a repository.
 *
 * Deletes exactly what scaffold-sandbox.mjs writes: the generated files, the
 * marker-delimited blocks in the appended documents, and the .gitignore entry.
 * Everything else is left in place and reported, so a project that added its own
 * dev-container content keeps it.
 */

import fs from "node:fs";
import path from "node:path";

import { failUsage, parseArgs, requireOptions } from "../../lib/cli.mjs";
import { isDir, isFile, listDir, readText, writeText } from "../../lib/fsx.mjs";
import { TemplateError } from "../../lib/template.mjs";
import { escapeRegExp, writeErr, writeOut } from "../../lib/text.mjs";
import {
  APPEND_TARGETS,
  BEGIN_MARKER,
  END_MARKER,
  GENERATED_DIRS,
  GENERATED_FILES,
  GITIGNORE_COMMENT,
  GITIGNORE_ENTRY,
} from "./sandbox-layout.mjs";

/** `# {project} - Agent Instructions` -> `^# .+ - Agent Instructions$`. */
function headingPattern(heading) {
  const [prefix, suffix = ""] = heading.split("{project}");
  return new RegExp(`^${escapeRegExp(prefix)}.+${escapeRegExp(suffix)}$`);
}

const HEADING_PATTERNS = APPEND_TARGETS.map(([, , heading]) => headingPattern(heading));

/** True when a document holds nothing but the heading the scaffold generated. */
function isHeadingOnly(text) {
  const body = text.trim();
  return !body.includes("\n") && HEADING_PATTERNS.some((pattern) => pattern.test(body));
}

function planFile(root, destination) {
  const target = path.join(root, destination);
  if (!isFile(target)) return { label: destination, target, status: "absent" };
  return { label: destination, target, status: "remove" };
}

function planBlock(root, destination) {
  const target = path.join(root, destination);
  if (!isFile(target)) return { label: destination, target, status: "absent" };

  const content = readText(target);
  const start = content.indexOf(BEGIN_MARKER);
  if (start === -1) {
    if (content.includes(END_MARKER)) {
      throw new TemplateError(
        `${destination} contains ${END_MARKER} without ${BEGIN_MARKER}; fix it by hand and run again`,
      );
    }
    return { label: destination, target, status: "absent" };
  }
  const end = content.indexOf(END_MARKER, start);
  if (end === -1) {
    throw new TemplateError(
      `${destination} contains ${BEGIN_MARKER} without ${END_MARKER}; fix it by hand and run again`,
    );
  }

  const before = content.slice(0, start).replace(/\s+$/, "");
  const after = content.slice(end + END_MARKER.length).replace(/^\s+/, "");
  let updated = "";
  if (before && after) updated = `${before}\n\n${after}\n`;
  else if (before) updated = `${before}\n`;
  else if (after) updated = `${after}\n`;

  if (!before && !after) return { label: destination, target, status: "delete" };
  if (isHeadingOnly(updated)) return { label: destination, target, status: "delete" };
  return { label: destination, target, status: "rewrite", content: updated };
}

function planGitignore(root) {
  const target = path.join(root, ".gitignore");
  if (!isFile(target)) return { label: ".gitignore", target, status: "absent" };

  const lines = readText(target).split("\n");
  const index = lines.findIndex(
    (line, position) =>
      line.trim() === GITIGNORE_COMMENT && (lines[position + 1] || "").trim() === GITIGNORE_ENTRY,
  );
  if (index === -1) return { label: ".gitignore", target, status: "absent" };

  lines.splice(index, 2);
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  if (!text.trim()) return { label: ".gitignore", target, status: "delete" };
  return { label: ".gitignore", target, status: "rewrite", content: `${text}\n` };
}

/** A generated directory is prunable only when nothing else lives in it. */
function planDir(root, destination, removing) {
  const target = path.join(root, destination);
  if (!isDir(target)) return { label: destination, target, status: "absent" };
  const remaining = listDir(target).filter((name) => !removing.has(path.join(target, name)));
  return remaining.length
    ? { label: destination, target, status: "keep", remaining }
    : { label: destination, target, status: "remove" };
}

function applyFile(action, dryRun) {
  const { label, target, status } = action;
  if (status === "absent") {
    writeOut(`absent       ${label}\n`);
    return "absent";
  }
  if (status === "remove" || status === "delete") {
    if (dryRun) {
      writeOut(`would remove ${label}\n`);
      return "removed";
    }
    fs.unlinkSync(target);
    writeOut(`removed      ${label}\n`);
    return "removed";
  }
  if (status === "rewrite") {
    if (dryRun) {
      writeOut(`would edit   ${label}\n`);
      return "edited";
    }
    writeText(target, action.content, fs.statSync(target).mode & 0o777);
    writeOut(`edited       ${label}\n`);
    return "edited";
  }
  throw new TemplateError(`unknown action for ${label}: ${status}`);
}

function applyDir(action, dryRun) {
  const { label, target, status } = action;
  if (status === "absent") {
    writeOut(`absent       ${label}/\n`);
    return;
  }
  if (status === "remove") {
    if (dryRun) {
      writeOut(`would remove ${label}/\n`);
      return;
    }
    fs.rmdirSync(target);
    writeOut(`removed      ${label}/\n`);
    return;
  }
  writeOut(`kept         ${label}/ (unrelated content: ${action.remaining.join(", ")})\n`);
}

const PROG = "uninstall-sandbox.mjs";

const SPEC = {
  description: "Remove the AI dev-container sandbox from a repository.",
  options: {
    dest: { type: "string", description: "repository root" },
    "dry-run": { type: "boolean", description: "report what would be removed, do not touch the project" },
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

  requireOptions(PROG, SPEC, values, ["dest"]);

  const root = path.resolve(values.dest);
  if (!isDir(root)) throw new TemplateError(`destination is not a directory: ${root}`);

  const dryRun = values["dry-run"] === true;

  // Plan everything before touching the project: a malformed marker aborts with
  // no partial removal.
  const files = GENERATED_FILES.map((destination) => planFile(root, destination));
  const blocks = APPEND_TARGETS.map(([destination]) => planBlock(root, destination));
  const gitignore = planGitignore(root);

  const removing = new Set(
    files.filter((action) => action.status === "remove").map((action) => action.target),
  );
  const dirs = GENERATED_DIRS.map((destination) => planDir(root, destination, removing));

  for (const action of files) applyFile(action, dryRun);
  for (const action of blocks) applyFile(action, dryRun);
  applyFile(gitignore, dryRun);
  for (const action of dirs) applyDir(action, dryRun);

  if (dryRun) writeOut("\ndry run: nothing was changed\n");
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
