#!/usr/bin/env node
/**
 * Bring an already initialized repository up to the current skill standard.
 *
 * The templates own a set of fixed blocks. Every block is delimited in the template by
 *
 *     <!-- skill:block:<id> [attrs] -->
 *     ...
 *     <!-- skill:end:<id> -->
 *
 * Attributes steer insertion when the target has no marker yet, which is the case for a
 * repository initialized by an older version of the skill:
 *
 *     before="<heading>"    insert the block before that heading line
 *     section="<heading>"   insert the block at the end of that section
 *     replace="body"        replace everything after the first level-1 heading
 *
 * Blocks that the current templates no longer contain are removed from the target when
 * they are still marked. Updating is idempotent: a second run reports no changes.
 */

import path from "node:path";

import { dropStale, isFullyManaged, loadBlocks, updateText, validateTemplates } from "../../lib/blocks.mjs";
import { failUsage, parseArgs } from "../../lib/cli.mjs";
import { isFile, readText, writeText } from "../../lib/fsx.mjs";
import { TemplateError } from "../../lib/template.mjs";
import { padEnd, writeErr, writeOut } from "../../lib/text.mjs";
import { SETTINGS_DESTINATION, TEMPLATE_ROOT, renderSettings } from "./scaffold.mjs";

const PROG = "update.mjs";

const SPEC = {
  description: "Update an initialized repository to the current skill standard.",
  options: {
    dest: { type: "string", required: true, description: "repository directory" },
    "dry-run": { type: "boolean", description: "report the changes without writing" },
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
  const dryRun = values["dry-run"] === true;

  const root = path.resolve(values.dest);
  const blocks = loadBlocks(TEMPLATE_ROOT);

  const problems = validateTemplates(TEMPLATE_ROOT, blocks);
  if (problems.length) {
    for (const problem of problems) writeErr(`error: ${problem}\n`);
    return 1;
  }

  const rows = [];
  const errors = [];
  const changed = [];

  for (const name of [...blocks.keys()].sort()) {
    const target = path.join(root, name);
    if (!isFile(target)) {
      const templateText = readText(path.join(TEMPLATE_ROOT, name));
      if (!isFullyManaged(templateText)) {
        errors.push(
          `missing file ${name}: it holds project content, so it is never created ` +
            `automatically; copy assets/templates/${name} from the skill, fill in its ` +
            `placeholders, then re-run update`,
        );
        continue;
      }
      if (!dryRun) writeText(target, templateText);
      rows.push([name, "-", "created"]);
      if (!dryRun) changed.push(name);
      continue;
    }

    const original = readText(target);
    const result = updateText(original, blocks.get(name));
    let text = result.text;
    const stale = dropStale(text, new Set(blocks.get(name).map((block) => block.id)));
    text = stale.text;

    for (const [blockId, action] of result.actions) rows.push([name, blockId, action]);
    for (const blockId of stale.removed) rows.push([name, blockId, "removed"]);
    for (const problem of result.problems) errors.push(`${name}: ${problem}`);

    if (text !== original) {
      changed.push(name);
      if (!dryRun) writeText(target, text);
    }
  }

  const settingsStatus = renderSettings(root, dryRun);
  if (settingsStatus !== "unchanged") {
    const verb = dryRun ? `would ${settingsStatus}` : settingsStatus;
    writeOut(`${verb} ${SETTINGS_DESTINATION}\n`);
    if (!dryRun) changed.push(SETTINGS_DESTINATION);
  }

  for (const [name, blockId, action] of rows) {
    if (action === "unchanged") continue;
    const prefix = dryRun ? "would " : "";
    writeOut(`${padEnd(prefix + action, 9)} ${padEnd(name, 28)} ${blockId}\n`);
  }

  for (const error of errors) writeErr(`error: ${error}\n`);
  if (errors.length) return 1;

  if (!changed.length) {
    writeOut(`baseline OK: ${root} already matches the current standard\n`);
    return 0;
  }

  writeOut(`${dryRun ? "would change" : "changed"} ${changed.length} file(s) in ${root}\n`);
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
