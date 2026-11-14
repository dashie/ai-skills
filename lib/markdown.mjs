import { splitLines } from "./text.mjs";

export const FRONTMATTER_RE = /^---[ \t\r\n\f\v]*\n([\s\S]*?)\n---[ \t\r\n\f\v]*\n/;
export const HEADING_RE = /^(#{1,6}) /;
export const SECTION_RE = /^##(?!#)\s+(.*)$/;
export const CHECKLIST_RE = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;
export const VERDICT_RE = /\*\*Verdict\*\*:\s*(PASS|NEEDS WORK)/gi;
export const LINK_RE = /\]\(([^)\s]+)\)/g;
export const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g;
export const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
export const TABLE_SEPARATOR_RE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
export const CODE_FENCE_RE = /^\s*(```|~~~)/;
export const HEADING_LINE_RE = /^(#{1,6})\s/;
export const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

export function matchAll(regex, text) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...String(text).matchAll(new RegExp(regex.source, flags))];
}

export function headingLevel(line) {
  const match = HEADING_LINE_RE.exec(line);
  return match ? match[1].length : null;
}

/** `## Heading` sections of a document body, keyed by heading text. */
export function sections(body) {
  const found = new Map();
  let current = null;
  let buffer = [];
  for (const line of splitLines(body)) {
    const heading = SECTION_RE.exec(line);
    if (heading) {
      if (current !== null) found.set(current, buffer.join("\n"));
      current = heading[1].trim();
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  if (current !== null) found.set(current, buffer.join("\n"));
  return found;
}

export function sectionLookup(found, name) {
  const lowered = String(name).trim().toLowerCase();
  for (const [key, value] of found.entries()) {
    if (key.trim().toLowerCase() === lowered) return value;
  }
  return null;
}

/**
 * Checkbox items of the `## Implementation checklist` section, with absolute line
 * numbers. Falls back to the whole document when the section is absent.
 */
export function checklistItems(text) {
  const lines = splitLines(text);
  let start = null;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = SECTION_RE.exec(lines[index]);
    if (!heading) continue;
    if (start === null) {
      if (heading[1].trim().toLowerCase() === "implementation checklist") start = index + 1;
    } else {
      end = index;
      break;
    }
  }
  if (start === null) {
    start = 0;
    end = lines.length;
  }

  const items = [];
  for (let index = start; index < end; index += 1) {
    const match = CHECKLIST_RE.exec(lines[index]);
    if (match) items.push({ line: index + 1, checked: match[1].toLowerCase() === "x", text: match[2] });
  }
  return items;
}

export function verdicts(text) {
  return matchAll(VERDICT_RE, text).map((match) => match[1]);
}

export function relativeLinks(text) {
  const links = [];
  for (const match of matchAll(LINK_RE, text)) {
    const target = match[1];
    if (target.startsWith("#") || target.startsWith("http://") || target.startsWith("https://")) continue;
    if (target.startsWith("mailto:") || target.startsWith("}")) continue;
    links.push(target.split("#", 1)[0]);
  }
  return links;
}

/** Line offsets of every line in `text`, used by the block editor. */
export function lineOffsets(text) {
  const offsets = [];
  let offset = 0;
  for (const line of splitLines(text)) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

/** Index of the line whose (right-trimmed) content equals `heading`, or -1. */
export function lineIndex(text, heading) {
  const lines = splitLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].replace(/\s+$/, "") === heading) return index;
  }
  return -1;
}
