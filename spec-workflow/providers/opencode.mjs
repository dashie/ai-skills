//! Execution metadata from the session opencode keeps for the current checkout.
//!
//! A provider is optional and self-contained: it detects the harness from the environment,
//! reads what that harness exposes, and returns the four strings the closure wants. Any
//! failure returns `null`, so the caller keeps working with `unknown`.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const name = "opencode";

/** The harness exports `OPENCODE` or `OPENCODE_PID` in every process it starts. */
export function detect(env = process.env) {
  return Boolean(env.OPENCODE || env.OPENCODE_PID);
}

export function collect({ root, env = process.env } = {}) {
  const home = env.HOME || env.USERPROFILE || "";
  const candidates = [
    env.OPENCODE_DB,
    env.XDG_DATA_HOME ? path.join(env.XDG_DATA_HOME, "opencode", "opencode.db") : null,
    home ? path.join(home, ".local", "share", "opencode", "opencode.db") : null,
  ].filter(Boolean);
  const database = candidates.find((candidate) => fs.existsSync(candidate));
  if (!database) return null;

  let DatabaseSync;
  try {
    ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite"));
  } catch {
    return null;
  }

  let db;
  try {
    db = new DatabaseSync(database, { readOnly: true });
    const row = db
      .prepare(
        `SELECT cost, tokens_input, tokens_output, tokens_reasoning,
                tokens_cache_read, tokens_cache_write, agent, model
           FROM session WHERE directory = ? ORDER BY time_updated DESC LIMIT 1`,
      )
      .get(root);
    if (!row) return null;
    return {
      agent: row.agent || undefined,
      model: formatModel(row.model),
      tokens: formatTokens(row),
      cost: formatCost(row.cost),
    };
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // The metadata is already decided; a failed close changes nothing.
    }
  }
}

function formatModel(raw) {
  if (!raw) return undefined;
  try {
    const model = JSON.parse(raw);
    if (model && model.id) {
      return model.providerID ? `${model.providerID}/${model.id}` : model.id;
    }
  } catch {
    // A plain string is already a model name.
  }
  return String(raw);
}

function formatTokens(row) {
  const parts = [
    ["input", Number(row.tokens_input) || 0],
    ["output", Number(row.tokens_output) || 0],
    ["reasoning", Number(row.tokens_reasoning) || 0],
    ["cache read", Number(row.tokens_cache_read) || 0],
    ["cache write", Number(row.tokens_cache_write) || 0],
  ];
  const total = parts.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return undefined;
  const breakdown = parts
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label} ${value.toLocaleString("en-US")}`)
    .join(", ");
  return `${total.toLocaleString("en-US")} (${breakdown})`;
}

function formatCost(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return `$${value.toFixed(6)}`;
}
