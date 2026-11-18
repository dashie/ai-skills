//! Execution-metadata providers.
//!
//! The close command asks this registry for the agent, model, tokens, and cost when its flags
//! and the generic `AISPEC_*` variables do not state them. A provider is one module with a
//! `name`, a `detect(env)` predicate, and a `collect({ root, env })` that returns the four
//! strings or `null`. Adding an agent is one file plus one line in `PROVIDERS`; a provider that
//! throws, returns `null`, or runs where its data is missing simply leaves the answer `unknown`.

import * as opencode from "./opencode.mjs";

const PROVIDERS = [opencode];

/**
 * Collect what the current harness exposes, or `{}` when nothing can be read.
 *
 * `AISPEC_TELEMETRY_PROVIDER` restricts the search to one named provider; otherwise every
 * provider whose `detect` accepts the environment is asked in order. Errors never escape.
 */
export function collectExecutionMetadata({ root, env = process.env } = {}) {
  const wanted = env.AISPEC_TELEMETRY_PROVIDER;
  const candidates = wanted
    ? PROVIDERS.filter((provider) => provider.name === wanted)
    : PROVIDERS.filter((provider) => {
        try {
          return provider.detect(env);
        } catch {
          return false;
        }
      });

  for (const provider of candidates) {
    try {
      const metadata = provider.collect({ root, env });
      if (metadata && Object.values(metadata).some(Boolean)) return metadata;
    } catch {
      // A provider that cannot answer is not an error; the next one may.
    }
  }
  return {};
}

export function providerNames() {
  return PROVIDERS.map((provider) => provider.name);
}
