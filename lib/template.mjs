import fs from "node:fs";
import path from "node:path";

import { asciiJson } from "./text.mjs";
import { ensureDir, exists, isFile, readText } from "./fsx.mjs";

export const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g;

export class TemplateError extends Error {}

export function collectPlaceholders(text) {
  return new Set([...String(text).matchAll(PLACEHOLDER_RE)].map((match) => match[1]));
}

/**
 * Read the values file. Lists are joined with newlines, except the keys declared
 * as JSON arrays, which are serialised as JSON so the template emits valid JSON.
 */
export function loadValues(valuesPath, { jsonKeys = [] } = {}) {
  if (!isFile(valuesPath)) throw new TemplateError(`values file not found: ${valuesPath}`);
  let data;
  try {
    data = JSON.parse(readText(valuesPath));
  } catch (error) {
    throw new TemplateError(`values file is not valid JSON: ${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new TemplateError("values file must contain a JSON object");
  }
  const values = {};
  for (const [key, raw] of Object.entries(data)) {
    let value = raw;
    if (Array.isArray(value)) {
      value = jsonKeys.includes(key) ? JSON.stringify(value) : value.map((item) => String(item)).join("\n");
    }
    if (typeof value !== "string") throw new TemplateError(`value for ${key} must be a string`);
    if (!value.trim()) throw new TemplateError(`value for ${key} is empty`);
    values[key] = value;
  }
  return values;
}

export function missingValues(required, values, usage) {
  const missing = [...required].filter((name) => !Object.hasOwn(values, name)).sort();
  if (!missing.length) return null;
  const sources = [...new Set(missing.flatMap((name) => usage.get(name) || []))].sort();
  return `${missing.join(", ")} (used in ${sources.join(", ")})`;
}

/** Replace every placeholder in sorted order, then assert none survived. */
export function substitute(template, values, label) {
  const required = [...collectPlaceholders(template)].sort();
  let rendered = template;
  for (const name of required) {
    rendered = rendered.split(`{{${name}}}`).join(values[name]);
  }
  const leftover = [...collectPlaceholders(rendered)].sort();
  if (leftover.length) {
    throw new TemplateError(`unresolved placeholders in ${label}: ${leftover.join(", ")}`);
  }
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

/**
 * Merge the editor-settings template into an existing file: missing keys are added,
 * existing values are never changed or removed.
 */
export function mergeSettings({ templateText, targetPath, dryRun }) {
  const template = JSON.parse(templateText);
  if (!exists(targetPath)) {
    if (!dryRun) {
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, `${asciiJson(template)}\n`, "utf8");
    }
    return "created";
  }

  let current;
  try {
    current = JSON.parse(readText(targetPath));
  } catch {
    return "skipped: existing file is not plain JSON, merge it by hand";
  }
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    return "skipped: existing file is not a JSON object, merge it by hand";
  }

  const missing = Object.entries(template).filter(([key]) => !Object.hasOwn(current, key));
  if (!missing.length) return "unchanged";
  for (const [key, value] of missing) current[key] = value;
  if (!dryRun) {
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, `${asciiJson(current)}\n`, "utf8");
  }
  return `merged ${missing.length} key(s)`;
}

export function composeGitignore({ variant, common, specific }) {
  const withNewline = (text) => (text.endsWith("\n") ? text : `${text}\n`);
  if (variant === "generic") return withNewline(common);
  return `${withNewline(specific)}\n${withNewline(common)}`;
}

export function readTemplate(root, relativePath) {
  const templatePath = path.join(root, relativePath);
  if (!isFile(templatePath)) throw new TemplateError(`missing template: ${templatePath}`);
  return readText(templatePath);
}
