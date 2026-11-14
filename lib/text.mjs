import { writeSync } from "node:fs";

export function writeOut(chunk) {
  writeSync(1, chunk);
}

export function writeErr(chunk) {
  writeSync(2, chunk);
}

export function splitLines(text) {
  return String(text).split("\n");
}

export function rstrip(text) {
  return String(text).replace(/\s+$/, "");
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function padEnd(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function reprString(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function reprItem(value) {
  return typeof value === "string" ? reprString(value) : pyRepr(value);
}

/** Python `str(value)` for the scalar and list values a plan frontmatter can hold. */
export function pyRepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(reprItem).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${reprString(key)}: ${reprItem(item)}`);
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}

/** JSON text byte-compatible with Python's `json.dumps(..., indent=2)` (ASCII only). */
export function asciiJson(value, indent = 2) {
  return JSON.stringify(value, null, indent).replace(/[\u007f-\uffff]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

/** JSON text with Python's default separators (`, ` and `: `). */
export function pyJsonDumps(value) {
  if (Array.isArray(value)) return `[${value.map(pyJsonDumps).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pyJsonDumps(item)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value);
}
