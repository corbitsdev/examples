# agent-quickstart

The smallest runnable [`@intx/agent`](https://www.npmjs.com/package/@intx/agent)
program. Define an inference source, build the environment the agent runs in,
send a prompt, print the reply, close. Nothing else.

This example answers "what is the minimum amount of code I need to talk to an
agent?" — read the body of [`src/cli.ts`](./src/cli.ts) and you have it.

Inference comes entirely from the environment — see [Inference](#inference)
below. There is no default provider or model.

## What it shows

- A `createAgent(definition, env)` call — the 0.2 shape. The **definition** is
  what the agent *is* (id, system prompt, tools, the provider/model pairs it may
  route to): portable data, no credentials. The **env** is what it runs against
  (sources, storage, audit, authorization): host-supplied wiring. The split is
  the point.
- Building an `InferenceSource` (`id`, `provider`, `baseURL`, `apiKey`, `model`).
  See [`@corbits/example-kit`](../../packages/example-kit/src/inference.ts).
- One round trip through `agent.send(prompt)`.
- Tearing the agent down with `agent.close()` so the per-directory lock is
  released cleanly. Skip it and the next run blocks on a stale lock.

Notably absent: tools, streaming, multi-turn state. `send()` and `close()` are
the two methods you need; everything else is layered on top.

`audit` and `authorize` come from `@intx/agent/testing` as no-ops. Those are the
two seams a real host fills with a durable audit log and a policy engine — using
the test doubles here keeps the file you read about the agent, not the host.

## Running

```bash
bun install     # from the repo root
# configure a provider — see Inference below
bun run start "name three planets"
```

```
agent agent-quickstart · openai-compatible/qwen2.5vl:7b
Mercury, Venus, Earth
```

The progress line names whatever you configured; nothing above is a default.

The reply goes to stdout; the progress line to stderr. The agent's context and
audit history land in `tmp/agent-quickstart/context/`. Re-running picks up the
previous conversation — `rm -rf tmp/agent-quickstart` for a fresh start.

## Inference

Configured from the environment, with no fallback — run it with nothing set and
it exits naming what to export. Point it at a local server:

```bash
export INTX_BASE_URL=http://localhost:11434/v1   # e.g. Ollama
export INTX_MODEL=qwen2.5vl:7b
export INTX_API_KEY=ollama
```

or at a hosted vendor:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export INTX_MODEL=claude-sonnet-4-6
```

Same code path either way. Full variable table in the
[root README](../../README.md#inference-configured-never-assumed); the resolver
is [`@corbits/example-kit`](../../packages/example-kit/src/inference.ts).
