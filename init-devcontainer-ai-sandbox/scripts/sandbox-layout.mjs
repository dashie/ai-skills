/**
 * Single source of truth for what the sandbox skill writes into a repository.
 *
 * Both scaffold-sandbox.mjs (render) and uninstall-sandbox.mjs (remove) read this
 * module, so the two directions can never disagree about the file set.
 */

export const BEGIN_MARKER = "<!-- BEGIN agent-sandbox -->";
export const END_MARKER = "<!-- END agent-sandbox -->";

export const GITIGNORE_COMMENT = "# AI sandbox run logs";
export const GITIGNORE_ENTRY = ".agent/logs/";

// template -> [destination, executable]
export const TARGETS = [
  ["devcontainer.json", ".devcontainer/devcontainer.json", false],
  ["Dockerfile", ".devcontainer/Dockerfile", false],
  ["stack-tools.sh", ".devcontainer/stack-tools.sh", true],
  ["post-create.sh", ".devcontainer/post-create.sh", true],
  ["git-guard.sh", ".devcontainer/git-guard.sh", true],
  ["run.sh", ".agent/run.sh", true],
  ["goal.md", ".agent/goal.md", false],
  ["docs/AGENT-SANDBOX.md", "docs/AGENT-SANDBOX.md", false],
];

// destination document -> [snippet, heading used when the file is created]
export const APPEND_TARGETS = [
  ["AGENTS.md", "agents-append.md", "# {project} - Agent Instructions"],
  ["docs/DEVELOPER-GUIDE.md", "developer-guide-append.md", "# Developer Guide - {project}"],
];

/** Directories the skill creates and that may be pruned when they end up empty. */
export const GENERATED_DIRS = [".devcontainer", ".agent"];

export const GENERATED_FILES = TARGETS.map(([, destination]) => destination);
