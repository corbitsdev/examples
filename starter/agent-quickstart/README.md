# agent-quickstart

The smallest runnable [`@intx/agent`](https://www.npmjs.com/package/@intx/agent)
program. Define an inference source, send a prompt, print the reply,
close. Nothing else.

This example answers "what is the minimum amount of code I need to talk
to an agent?" — read the body of [`src/cli.ts`](./src/cli.ts) and you
have it. It targets the published `@intx/agent` **0.1.2** API.

## What it shows

- Building an `InferenceSource` (`id`, `provider`, `baseURL`, `apiKey`,
  `model`) from `ANTHROPIC_API_KEY`.
- A single `createAgent({ contextDir, sources, defaultSource, systemPrompt, tools })`
  call. Passing `contextDir` lets the agent manage an isogit-backed
  context and audit store inside that directory for you.
- One round trip through `agent.send(prompt)`, which returns the reply
  text and the full turn that produced it.
- Tearing the agent down with `agent.close()` so the per-directory lock
  is released cleanly.

Notably absent: tools, streaming, multi-turn state. `agent.send()` and
`agent.close()` are the two methods you need; everything else on the
`Agent` surface is layered on top.

## Prerequisites

- [Bun](https://bun.sh) — the agent packages ship TypeScript source and
  the `start` script runs `bun run src/cli.ts`.
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

## A note on the `overrides` block

`package.json` carries an `overrides` block pinning every `@intx/*`
package to `0.1.2`:

```json
"overrides": {
  "@intx/inference": "0.1.2",
  "@intx/types": "0.1.2",
  "@intx/storage-isogit": "0.1.2",
  "@intx/mime": "0.1.2",
  "@intx/log": "0.1.2",
  "@intx/crypto-node": "0.1.2"
}
```

This works around a publishing quirk in the current release: each
`@intx` package's manifest pins its siblings to `0.0.0`, a version that
was never published, so a plain `npm install @intx/agent` fails with
`ETARGET`. Every package *is* published at `0.1.2`, so forcing the whole
graph to `0.1.2` resolves it. Once the `@intx` packages are republished
with correct internal version ranges, this block can be removed.
