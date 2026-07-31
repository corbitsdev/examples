# agent-quickstart

The smallest runnable [`@intx/agent`](https://www.npmjs.com/package/@intx/agent)
program. Describe an agent, stand up the host pieces it needs, send one
prompt, print the reply, close.

This example answers "what is the minimum amount of code I need to talk
to an agent?" — read the body of [`src/cli.ts`](./src/cli.ts) and you
have it. It targets the published `@intx/agent` **0.2.2** API.

This directory is self-contained. Copy it anywhere, run `bun install`,
and it works — it depends on nothing else in this repository.

## What it shows

- `defineAgent({ id, systemPrompt, tools, capabilities, inference })` —
  the portable half of an agent. It carries no credentials and no
  storage, only the description of what the agent *is*.
- `createAgent(definition, env)` — the host half. `env` is where the
  concrete runtime pieces go:
  - `sources` / `defaultSource` — the `InferenceSource`
    (`id`, `provider`, `baseURL`, `apiKey`, `model`) built from
    `ANTHROPIC_API_KEY`, and the id of the one that starts active.
  - `storage` and `audit` — both satisfied by the single object
    `createIsogitStore(dir)` returns, which implements `ContextStore`
    and `AuditStore` over one git repository.
  - `workdir` — the agent's singleton lock boundary. It **must** be the
    same directory passed to `createIsogitStore`.
  - `authorize` — the policy callback tools are checked against. This
    agent has no tools, so it is never consulted; it denies by default
    so that adding a tool later fails closed.
  - `directors` — `createDefaultDirectorRegistry()`, the built-ins-only
    registry.
- One round trip through `agent.send(prompt)`, which returns the reply
  text and the full turn that produced it.
- Tearing the agent down with `agent.close()` so the per-directory lock
  is released cleanly.

Notably absent: tools, streaming, multi-turn state. `agent.send()` and
`agent.close()` are the two methods you need; everything else on the
`Agent` surface is layered on top.

## Prerequisites

- [Bun](https://bun.sh) — the `start` script runs `bun run src/cli.ts`.
- An `ANTHROPIC_API_KEY`.

## Running

```bash
cd starter/agent-quickstart
bun install
export ANTHROPIC_API_KEY=sk-...
bun run start "name three planets"
```

The reply is written to stdout; the agent's context and audit history
land in `tmp/agent-quickstart/context/` under the working directory.
Re-running picks up the previous conversation — delete the directory
for a fresh start:

```bash
rm -rf tmp/agent-quickstart
```

Set `ANTHROPIC_MODEL` to use a model other than the default
(`claude-sonnet-4-6`). Without `ANTHROPIC_API_KEY` the example prints a
one-line message explaining what to set and exits non-zero.

Type-check with:

```bash
bun run typecheck
```
