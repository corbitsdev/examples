# workflow-quickstart

The smallest runnable `@intx/workflow` program. Define two agents, wire
them into a two-step `draft -> review` workflow, run it, print the
outputs. The workflow analog of [`agent-quickstart`](../agent-quickstart).

The workflow lives in [`src/workflow.ts`](./src/workflow.ts) — read that
first. [`src/cli.ts`](./src/cli.ts) is just the entry point.

## What it shows

- `defineWorkflow` + `step` — two steps, the second with `after: ["draft"]`.
- Step inputs as path selectors: `{ from: "trigger.payload" }` and
  `{ from: "steps.draft.output" }` thread data from the trigger through
  one step into the next.
- `runLocal(definition, { triggerPayload, invokeStep })` — runs the
  workflow in-process with a real `invokeStep` that wraps
  `createAgent` / `agent.send` for live inference.
- `await run.complete` → `{ terminalStatus, outputs }`.

## Setup

`@intx/*` come from npm, pinned at `0.2.2` through the root
`package.json` catalog. From the repo root:

```bash
bun install
```

## Running

Configure a provider first — see [Providers](#providers) below.

```bash
cd starter/workflow-quickstart
bun run start "the rings of Saturn"
```

```
workflow workflow-quickstart · openai-compatible/<the model you configured>
  → step draft (agent draft) running…
  ✓ step draft done (475 chars)
  → step review (agent review) running…
  ✓ step review done (180 chars)
workflow workflow-quickstart · completed

draft:  <a paragraph about the rings of Saturn>
review: <one sharper sentence>
```

Step progress is written to stderr; the `draft:` / `review:` results go
to stdout.

## Providers

The endpoint, model and credential all come from the environment, and
none of them is defaulted. With nothing configured the run exits
immediately naming what to export.

| Variable | Meaning |
| --- | --- |
| `INTX_BASE_URL` | Endpoint root. |
| `INTX_MODEL` | Model id served there. Always required. |
| `INTX_API_KEY` | Credential — a placeholder for servers that ignore it. |
| `INTX_PROVIDER` | Wire protocol: `anthropic`, `openai`, `openai-compatible`, `google-genai`. Defaults to `openai-compatible`. |
| `ANTHROPIC_API_KEY` `OPENAI_API_KEY` `GOOGLE_API_KEY` `GEMINI_API_KEY` | A vendor key implies that vendor's endpoint and protocol; `INTX_MODEL` is still required. |

A local server:

```bash
export INTX_BASE_URL=http://localhost:11434/v1   # e.g. Ollama
export INTX_MODEL=qwen2.5vl:7b
export INTX_API_KEY=ollama
```

A hosted vendor:

```bash
export OPENAI_API_KEY=sk-...
export INTX_MODEL=gpt-4o-mini
```

No vendor branch anywhere in the runtime — `provider` only selects a
wire-format adapter, and everything else is configuration passed
through. See [`@corbits/example-kit`](../../packages/example-kit/src/inference.ts) and the
[root README](../../README.md#inference-configured-never-assumed).

Each step writes its context under `tmp/workflow-quickstart/`; delete it
for a fresh start.
