#!/usr/bin/env node
/**
 * Approve the skills for the repository (or directory) this is run in, so an
 * agent can execute the skill scripts without a permission prompt each time.
 *
 * Writes the location block that lets the agent run the skill scripts: one
 * `aispec:*` command approval plus the skills directory in `allowed_directories`.
 * Naming the dispatcher keeps the approval narrow; an older `node:*` entry is
 * replaced.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { failUsage, parseArgs } from "../lib/cli.mjs";
import { isDir, realpath } from "../lib/fsx.mjs";
import {
  PermissionsError,
  approveSkills,
  defaultSkillsDirectories,
  permissionsConfigPath,
  revokeSkills,
} from "../lib/skill-approvals.mjs";
import { writeErr, writeOut } from "../lib/text.mjs";

const PROG = "skill-allow";
const SKILLS_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SPEC = {
  description:
    "Approve the aispec command and the skills directory for the repository or directory you run this " +
    "in, so Copilot stops asking before invoking the skill scripts.",
  options: {
    dir: {
      type: "string",
      default: ".",
      description: "directory whose permission location to approve",
    },
    config: {
      type: "string",
      description: "permissions-config.json to update (default: $COPILOT_HOME/permissions-config.json)",
    },
    "skills-dir": {
      type: "string",
      repeatable: true,
      default: [],
      description: "additional skills directory to allow (repeatable)",
    },
    remove: {
      type: "boolean",
      default: false,
      description: "remove the approvals for this location instead of adding them",
    },
    "dry-run": {
      type: "boolean",
      default: false,
      description: "print the resulting configuration instead of writing it",
    },
  },
  positionals: [],
};

function main() {
  const values = parseArgs(process.argv.slice(2), SPEC, { prog: PROG });
  const dir = realpath(path.resolve(values.dir));
  if (!isDir(dir)) failUsage(PROG, SPEC, `--dir: not a directory: ${values.dir}`);

  const run = values.remove ? revokeSkills : approveSkills;
  const result = run({
    dir,
    configPath: values.config ? path.resolve(values.config) : permissionsConfigPath(),
    skillsDirs: defaultSkillsDirectories(SKILLS_ROOT, values["skills-dir"] || []),
    dryRun: values["dry-run"],
  });

  if (values["dry-run"]) {
    writeOut(`${JSON.stringify(result.config, null, 2)}\n`);
    return;
  }

  if (values.remove) {
    writeOut(
      result.changed
        ? `${PROG}: removed the skill approvals for ${result.key} from ${result.file}\n`
        : `${PROG}: nothing to remove for ${result.key} in ${result.file}\n`,
    );
    return;
  }

  writeOut(`${PROG}: approved for ${result.key}\n`);
  writeOut(`  config:    ${result.file}\n`);
  writeOut(`  commands:  aispec:*\n`);
  for (const allowed of result.dirs) writeOut(`  directory: ${allowed}\n`);
  writeOut(
    "\nApproval is per location: rerun this in every repository where you use the skills.\n" +
      "Non-interactive runs (-p) ignore saved approvals; pass --allow-tool 'shell(aispec:*)' --add-dir <skills> there.\n",
  );
}

try {
  main();
} catch (error) {
  if (error && error.name === "UsageError") {
    writeErr(`${error.usage ? `${error.usage}\n` : ""}${PROG}: error: ${error.message}\n`);
    process.exit(2);
  }
  if (error instanceof PermissionsError) failUsage(PROG, SPEC, error.message);
  writeErr(`${PROG}: error: ${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
}
