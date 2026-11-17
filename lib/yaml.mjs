/** The deliberately small YAML subset used by `.spec-workflow.yml` and plan frontmatter. */

function stripComment(line) {
  const out = [];
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      out.push(char);
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out.push(char);
      continue;
    }
    if (char === "#" && (index === 0 || line[index - 1] === " " || line[index - 1] === "\t")) break;
    out.push(char);
  }
  return out.join("").replace(/\s+$/, "");
}

function coerce(raw) {
  const value = String(raw).trim();
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(",").map((part) => coerce(part)) : [];
  }
  const lowered = value.toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return value;
}

export function parseMiniYaml(text) {
  const data = {};
  let current = null;
  let section = null;
  for (const raw of String(text).split("\n")) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    const stripped = line.replace(/^\s+/, "");
    if (stripped.startsWith("- ")) {
      if (current === null) continue;
      if (!Array.isArray(data[current])) data[current] = [];
      data[current].push(coerce(stripped.slice(2)));
      continue;
    }
    const match = /^([^:\s][^:]*?)\s*:\s*(.*)$/.exec(stripped);
    if (!match) continue;
    current = match[1].trim();
    const value = match[2].trim();
    data[current] = value === "" ? "" : coerce(value);
    // Indented keys are also exposed as `section.key` so nested blocks cannot collide.
    if (line.length === stripped.length) {
      section = value === "" ? current : null;
    } else if (section) {
      data[`${section}.${current}`] = data[current];
    }
  }
  return data;
}
