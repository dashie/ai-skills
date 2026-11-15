import path from "node:path";

import { isDir, listDir, readText } from "./fsx.mjs";
import { headingLevel, lineIndex } from "./markdown.mjs";
import { escapeRegExp } from "./text.mjs";

const BLOCK_SOURCE =
  "<!-- skill:block:(?<id>[a-z0-9-]+)(?<attrs>[^\\n>]*)-->\\n(?<body>[\\s\\S]*?)<!-- skill:end:\\k<id> -->\\n";

export const BLOCK = new RegExp(BLOCK_SOURCE, "g");
export const BEGIN = /<!-- skill:block:([a-z0-9-]+)[^\n>]*-->/g;
export const END = /<!-- skill:end:([a-z0-9-]+) -->/g;
const ATTR = /([a-z]+)="([^"]*)"/g;
const TITLE = /^# /;

/** Lines of `text` with their endings, like Python's `splitlines(keepends=True)`. */
export function splitKeepEnds(text) {
  return String(text).match(/[^\n]*\n|[^\n]+$/g) || [];
}

export function regionRe(blockId) {
  return new RegExp(
    "<!-- skill:block:" + escapeRegExp(blockId) + "[^\\n>]*-->\\n" +
      "[\\s\\S]*?<!-- skill:end:" + escapeRegExp(blockId) + " -->\\n",
  );
}

export function templateFiles(templatesRoot) {
  const names = listDir(templatesRoot).filter((name) => name.endsWith(".md") && !isDir(path.join(templatesRoot, name)));
  for (const sub of ["docs", ".github"]) {
    const folder = path.join(templatesRoot, sub);
    if (!isDir(folder)) continue;
    for (const name of listDir(folder)) {
      if (name.endsWith(".md")) names.push(`${sub}/${name}`);
    }
  }
  return names;
}

/** `{relative path: [block, ...]}` for every marked template block. */
export function loadBlocks(templatesRoot) {
  const blocks = new Map();
  for (const name of templateFiles(templatesRoot)) {
    const text = readText(path.join(templatesRoot, name));
    const found = [];
    for (const match of text.matchAll(BLOCK)) {
      const attrs = {};
      for (const [, key, value] of match.groups.attrs.matchAll(ATTR)) attrs[key] = value;
      found.push({ id: match.groups.id, attrs, body: match.groups.body, region: match[0] });
    }
    if (found.length) blocks.set(name, found);
  }
  return blocks;
}

export function validateTemplates(templatesRoot, blocks) {
  const problems = [];
  for (const name of templateFiles(templatesRoot)) {
    const text = readText(path.join(templatesRoot, name));
    const begins = [...text.matchAll(BEGIN)].map((match) => match[1]);
    const ends = [...text.matchAll(END)].map((match) => match[1]);
    if (begins.slice().sort().join("\n") !== ends.slice().sort().join("\n")) {
      problems.push(`unbalanced markers in template ${name}`);
    }
    if (begins.length !== new Set(begins).size) problems.push(`duplicate block id in template ${name}`);
  }
  for (const [name, found] of blocks) {
    for (const block of found) {
      if (!block.body.trim()) problems.push(`empty block ${block.id} in template ${name}`);
      if (block.body.includes("{{")) problems.push(`placeholder inside managed block ${block.id} in template ${name}`);
    }
  }
  return problems;
}

function offsetOfLine(text, index) {
  const lines = splitKeepEnds(text);
  let offset = 0;
  for (let number = 0; number < lines.length; number += 1) {
    if (number === index) return offset;
    offset += lines[number].length;
  }
  return offset;
}

/** Offset of the first heading that closes the `heading` section, or null. */
export function sectionEndOffset(text, heading) {
  const lines = splitKeepEnds(text);
  let start = -1;
  let level = null;
  for (let number = 0; number < lines.length; number += 1) {
    if (lines[number].replace(/\s+$/, "") === heading) {
      start = number;
      level = headingLevel(heading);
      break;
    }
  }
  if (start === -1) return null;
  let offset = lines.slice(0, start + 1).reduce((total, line) => total + line.length, 0);
  for (let number = start + 1; number < lines.length; number += 1) {
    const current = headingLevel(lines[number]);
    if (current !== null && current <= level) return offset;
    offset += lines[number].length;
  }
  return text.length;
}

export function replaceSection(text, heading, region) {
  const lines = splitKeepEnds(text);
  let start = -1;
  let level = null;
  for (let number = 0; number < lines.length; number += 1) {
    if (lines[number].replace(/\s+$/, "") === heading) {
      start = number;
      level = headingLevel(heading);
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let number = start + 1; number < lines.length; number += 1) {
    const current = headingLevel(lines[number]);
    if (current !== null && current <= level) {
      end = number;
      break;
    }
  }

  // Comment lines directly above the closing heading belong to the next section:
  // they are often block markers of another tool, and replacing the region would
  // silently delete them.
  let probe = end;
  while (probe > start + 1) {
    const stripped = lines[probe - 1].trim();
    if (stripped === "" || (stripped.startsWith("<!--") && stripped.endsWith("-->"))) {
      probe -= 1;
    } else {
      break;
    }
  }
  if (probe < end) {
    let hasComment = false;
    for (let index = probe; index < end; index += 1) {
      if (lines[index].trim().startsWith("<!--")) hasComment = true;
    }
    if (hasComment) end = probe;
  }

  let head = lines.slice(0, start).join("");
  let tail = lines.slice(end).join("");
  if (head && !head.endsWith("\n\n")) head = `${head.replace(/\n+$/, "")}\n\n`;
  if (tail && !region.endsWith("\n\n")) region = `${region.replace(/\n+$/, "")}\n\n`;
  return head + region + tail;
}

export function replaceBody(text, region) {
  const lines = splitKeepEnds(text);
  for (let number = 0; number < lines.length; number += 1) {
    if (TITLE.test(lines[number])) {
      const head = `${lines.slice(0, number + 1).join("").replace(/\n+$/, "")}\n\n`;
      return head + region;
    }
  }
  return null;
}

export function insertAt(text, offset, region) {
  let head = text.slice(0, offset);
  const tail = text.slice(offset);
  if (head && !head.endsWith("\n\n")) head = `${head.replace(/\n+$/, "")}\n\n`;
  if (tail && !region.endsWith("\n\n")) region = `${region.replace(/\n+$/, "")}\n\n`;
  return head + region + tail;
}

/** Insert an unmarked block. Returns `[newText, action]` or `[null, problem]`. */
export function insertBlock(text, block) {
  const body = block.body;
  if (body.trim() && text.includes(body)) {
    const replacement = `${block.region.replace(/^\n+|\n+$/g, "")}\n`;
    return [text.replace(body, () => replacement), "adopted"];
  }

  let heading = null;
  for (const line of body.split("\n")) {
    if (line.trim()) {
      heading = headingLevel(line) !== null ? line.replace(/\s+$/, "") : null;
      break;
    }
  }
  if (heading && lineIndex(text, heading) !== -1) {
    return [replaceSection(text, heading, block.region), "adopted"];
  }

  if (block.attrs.replace === "body") {
    const updated = replaceBody(text, block.region);
    if (updated !== null) return [updated, "adopted"];
    return [null, "no level-1 heading to replace in the target"];
  }

  // `after="<block id>"` anchors on a managed block instead of a heading: the text is
  // inserted directly after that block, outside every region an update may replace.
  const after = block.attrs.after;
  if (after) {
    const match = regionRe(after).exec(text);
    if (match) return [insertAt(text, match.index + match[0].length, block.region), "inserted"];
    return [null, `anchor block '${after}' not found`];
  }

  const anchor = block.attrs.before;
  if (anchor) {
    const index = lineIndex(text, anchor);
    if (index !== -1) return [insertAt(text, offsetOfLine(text, index), block.region), "inserted"];
    return [null, `anchor heading '${anchor}' not found`];
  }

  const section = block.attrs.section;
  if (section) {
    const offset = sectionEndOffset(text, section);
    if (offset !== null) return [insertAt(text, offset, block.region), "inserted"];
    return [null, `anchor section '${section}' not found`];
  }

  return [text + block.region, "appended"];
}

export function updateText(text, blocks) {
  const actions = [];
  const problems = [];
  for (const block of blocks) {
    const matcher = regionRe(block.id);
    if (matcher.test(text)) {
      const updated = text.replace(matcher, () => block.region);
      actions.push([block.id, updated !== text ? "updated" : "unchanged"]);
      text = updated;
      continue;
    }
    const [updated, outcome] = insertBlock(text, block);
    if (updated === null) {
      problems.push(`${block.id}: ${outcome}`);
      continue;
    }
    actions.push([block.id, outcome]);
    text = updated;
  }
  return { text, actions, problems };
}

/** Remove marked blocks whose id is not part of the current standard. */
export function dropStale(text, keep) {
  const removed = [];
  for (;;) {
    let match = null;
    for (const item of text.matchAll(BLOCK)) {
      if (!keep.has(item.groups.id)) {
        match = item;
        break;
      }
    }
    if (!match) return { text, removed };
    removed.push(match.groups.id);
    const head = text.slice(0, match.index);
    const tail = text.slice(match.index + match[0].length);
    if (!head.trim()) {
      text = tail.replace(/^\n+/, "");
    } else if (!tail.trim()) {
      text = `${head.replace(/\n+$/, "")}\n`;
    } else {
      text = `${head.replace(/\n+$/, "")}\n\n${tail.replace(/^\n+/, "")}`;
    }
  }
}

/**
 * True when a template is nothing but managed blocks and blank lines: such a file
 * carries no project content, so it can be created from the template as-is.
 */
export function isFullyManaged(text) {
  if (text.includes("{{")) return false;
  return text.replace(new RegExp(BLOCK.source, "g"), "").trim() === "";
}
