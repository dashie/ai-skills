import { writeErr, writeOut } from "./text.mjs";

/**
 * Minimal command-line parser shaped like the argparse contract the scripts rely
 * on: options, positionals, subcommands, choices, repeatable flags, and a
 * `--help` that exits 0. Accepts both `--opt value` and `--opt=value`.
 */
export class UsageError extends Error {
  constructor(message, { usage = null } = {}) {
    super(message);
    this.name = "UsageError";
    this.usage = usage;
  }
}

function usageLine(prog, options, positionals, subcommands) {
  const parts = [prog, "[-h]"];
  for (const [name, option] of Object.entries(options || {})) {
    const label = name.toUpperCase().replace(/-/g, "_");
    const flag = option.type === "boolean" ? `--${name}` : `--${name} ${label}`;
    parts.push(option.required ? flag : `[${flag}]`);
  }
  if (subcommands) parts.push(`{${Object.keys(subcommands).join(",")}}`);
  for (const positional of positionals || []) {
    parts.push(positional.optional ? `[${positional.name}]` : positional.name);
  }
  return `usage: ${parts.join(" ")}`;
}

function helpText(prog, spec, path = []) {
  const lines = [usageLine(prog, spec.options, spec.positionals, spec.subcommands), ""];
  if (spec.description) lines.push(spec.description, "");

  const positionals = spec.positionals || [];
  if (positionals.length) {
    lines.push("positional arguments:");
    for (const positional of positionals) {
      const label = positional.choices
        ? `${positional.name}  {${positional.choices.join(",")}}`
        : positional.name;
      lines.push(`  ${label}`);
    }
    lines.push("");
  }

  lines.push("options:");
  lines.push("  -h, --help            show this help message and exit");
  for (const [name, option] of Object.entries(spec.options || {})) {
    const flag = option.type === "boolean" ? `--${name}` : `--${name} ${name.toUpperCase()}`;
    const extra = option.description ? `  ${option.description}` : "";
    const chosen = option.choices ? ` (choose from ${option.choices.map((item) => `'${item}'`).join(", ")})` : "";
    lines.push(`  ${flag}${extra}${chosen}`);
  }

  const subcommands = spec.subcommands;
  if (subcommands) {
    lines.push("", "subcommands:");
    for (const [name, sub] of Object.entries(subcommands)) {
      lines.push(`  ${name}${sub.description ? `  ${sub.description}` : ""}`);
    }
  }
  return lines.join("\n");
}

function setOption(values, spec, name, rawValue) {
  const option = spec.options[name];
  if (option.type === "boolean") {
    values[name] = true;
    return;
  }
  if (option.repeatable) {
    if (!Array.isArray(values[name])) values[name] = [];
    values[name].push(rawValue);
    return;
  }
  if (option.choices && !option.choices.includes(rawValue)) {
    throw new UsageError(
      `argument --${name}: invalid choice: '${rawValue}' (choose from ${option.choices.map((item) => `'${item}'`).join(", ")})`,
    );
  }
  values[name] = rawValue;
}

function parseScope(argv, spec, prog, path, applyHelp) {
  const options = { ...(spec.options || {}) };
  const values = {};
  for (const [name, option] of Object.entries(options)) {
    values[name] = option.type === "boolean" ? false : option.default;
    if (option.repeatable) values[name] = option.default === undefined ? [] : option.default;
    if (option.type === "boolean" && option.default !== undefined) values[name] = option.default;
  }

  const positionals = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === "-h" || token === "--help") {
      writeOut(helpText(prog, spec, path) + "\n");
      process.exit(0);
    }
    if (token.startsWith("--") && token.length > 2) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      if (!Object.hasOwn(options, name)) {
        throw new UsageError(`unrecognized arguments: ${token}`, { usage: applyHelp(prog, spec) });
      }
      if (options[name].type === "boolean") {
        if (eq !== -1) {
          throw new UsageError(`argument --${name}: ignored explicit argument '${body.slice(eq + 1)}'`);
        }
        values[name] = true;
        index += 1;
        continue;
      }
      if (eq !== -1) {
        setOption(values, spec, name, body.slice(eq + 1));
        index += 1;
        continue;
      }
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith("--") && next.length > 2)) {
        throw new UsageError(`argument --${name}: expected one argument`);
      }
      setOption(values, spec, name, next);
      index += 2;
      continue;
    }
    positionals.push(token);
    index += 1;
  }

  const declared = spec.positionals || [];
  if (positionals.length > declared.length) {
    throw new UsageError(`unrecognized arguments: ${positionals.slice(declared.length).join(" ")}`);
  }
  declared.forEach((positional, position) => {
    const value = positionals[position];
    if (value === undefined) {
      if (positional.optional) return;
      throw new UsageError(`the following arguments are required: ${positional.name}`);
    }
    if (positional.choices && !positional.choices.includes(value)) {
      throw new UsageError(
        `argument ${positional.name}: invalid choice: '${value}' (choose from ${positional.choices.map((item) => `'${item}'`).join(", ")})`,
      );
    }
    values[positional.name] = value;
  });

  return values;
}

/**
 * Parse `argv`. Returns `{ command, ...values }` where `command` is the selected
 * subcommand name (or null). Throws UsageError for anything argparse would reject.
 */
export function parseArgs(argv, spec, { prog = "program" } = {}) {
  const usage = (name, sub) => usageLine(name, sub.options, sub.positionals, sub.subcommands);

  if (!spec.subcommands) {
    return { command: null, ...parseScope(argv, spec, prog, [], usage) };
  }

  const first = argv[0];
  if (first === "-h" || first === "--help") {
    writeOut(helpText(prog, spec) + "\n");
    process.exit(0);
  }
  if (first === undefined) {
    throw new UsageError("the following arguments are required: command", {
      usage: usage(prog, spec),
    });
  }
  const sub = spec.subcommands[first];
  if (!sub) {
    throw new UsageError(
      `argument command: invalid choice: '${first}' (choose from ${Object.keys(spec.subcommands).map((item) => `'${item}'`).join(", ")})`,
      { usage: usage(prog, spec) },
    );
  }
  const childProg = `${prog} ${first}`;
  const values = parseScope(argv.slice(1), { ...sub, description: sub.description || spec.description }, childProg, [first], usage);
  return { command: first, ...values };
}

export function usageText(prog, spec) {
  return usageLine(prog, spec.options, spec.positionals, spec.subcommands);
}

/** argparse's `parser.error`: usage plus message on stderr, exit 2. */
export function failUsage(prog, spec, message) {
  writeErr(`${usageText(prog, spec)}\n${prog}: error: ${message}\n`);
  process.exit(2);
}

/** Reject a missing required option set the way the caller documents it. */
export function requireOptions(prog, spec, values, required) {
  const missing = required.filter((name) => values[name] === undefined || values[name] === null);
  if (missing.length) {
    failUsage(prog, spec, `${missing.map((name) => `--${name}`).join(" and ")} are required`);
  }
}
