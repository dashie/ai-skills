# Execution-metadata providers

`aispec plan close` records four facts about the run that executed the plan: the agent, the
model, the tokens, and the cost. A caller supplies them with `--agent`, `--model`, `--tokens`,
and `--cost`, or with the generic `AISPEC_*` variables. When a value is still missing, the
close command asks this directory's registry, so a known harness can fill it automatically
without the close command depending on that harness.

Every provider is optional. If none recognizes the environment, or the one that does cannot
read its data, the close command records `unknown` and exits normally.

## Contract

A provider is one ES module exporting three things:

```js
export const name = "my-agent";                       // unique, used by AISPEC_TELEMETRY_PROVIDER

export function detect(env = process.env) {           // true only inside that harness
  return Boolean(env.MY_AGENT_SESSION);
}

export function collect({ root, env = process.env }) { // the four strings, or null
  return {
    agent: "my-agent",
    model: "provider/model",
    tokens: "1,234",
    cost: "$0.01",
  };
}
```

Rules:

- `detect` is a pure predicate over the environment. It must not throw; a throw is caught.
- `collect` receives the repository root and the environment, and returns an object with any
  subset of `agent`, `model`, `tokens`, and `cost`. Missing members stay `unknown`.
- `collect` returns `null` when the harness is present but its data is unavailable — a missing
  file, an unreadable database, an unsupported runtime. It may throw; the registry catches it.
- A provider reads only what its harness already exposes. It must not start a network request
  or write anything.
- Use the Node.js standard library only. An optional module that does not exist in the running
  Node version is a reason to return `null`, never to fail the process.

## Selection

1. An explicit flag wins.
2. Then `AISPEC_AGENT`, `AISPEC_MODEL`, `AISPEC_TOKENS`, and `AISPEC_COST`.
3. Then the first provider whose `detect` accepts the environment, in the order listed in
   `index.mjs`.
4. Anything still missing is `unknown`.

`AISPEC_TELEMETRY_PROVIDER=<name>` restricts step 3 to that one provider; an unknown name
selects none. This is useful for a harness that can be detected in more than one way, and for
tests.

## Adding a provider

1. Add `<agent>.mjs` here following the contract.
2. Import it in `index.mjs` and add it to `PROVIDERS`; the first detected provider wins, so
   order them from most to least specific.
3. Add a smoke case in `scripts/smoke.mjs` that creates the provider's data, sets its
   detection variable, runs `close`, and asserts the `## Closure` block. Add a second case
   where the data is missing and assert the close still succeeds with `unknown`.

## Current providers

| Provider | Detects | Data source |
|---|---|---|
| `opencode` | `OPENCODE` or `OPENCODE_PID` | the `session` table of `opencode.db`, latest row for the repository root |
