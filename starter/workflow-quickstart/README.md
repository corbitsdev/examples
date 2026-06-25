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

`@intx/workflow` is not on npm yet, so this example consumes `@intx/*`
from the `interchange` checkout vendored as a git submodule at the repo
root, resolved through the root `package.json` bun workspace. From the
repo root:

```bash
git submodule update --init interchange
bun install
```

Run from inside this directory (or the repo root) so `@intx/*` resolve
to the submodule.

## Running

```bash
cd starter/workflow-quickstart
export ANTHROPIC_API_KEY=sk-...
bun run start "the rings of Saturn"
```

```
workflow workflow-quickstart · anthropic/claude-sonnet-4-6
  → step draft (agent draft) running…
  ✓ step draft done (312 chars)
  → step review (agent review) running…
  ✓ step review done (88 chars)
workflow workflow-quickstart · completed

draft:  <a paragraph about the rings of Saturn>
review: <one sharper sentence>
```

Step progress is written to stderr; the `draft:` / `review:` results go
to stdout.

## Providers

The provider is picked from the environment — set a key and go. Auto
order: Anthropic → OpenAI → Google.

| Provider            | Key                                 | Default model       |
| ------------------- | ----------------------------------- | ------------------- |
| `anthropic`         | `ANTHROPIC_API_KEY`                 | `claude-sonnet-4-6` |
| `openai`            | `OPENAI_API_KEY`                    | `gpt-4o-mini`       |
| `openai-compatible` | `OPENAI_API_KEY` + `OPENAI_BASE_URL`| `gpt-4o-mini`       |
| `google`            | `GOOGLE_API_KEY` / `GEMINI_API_KEY` | `gemini-2.0-flash`  |

Force a provider with `INTX_PROVIDER`, override the model with
`INTX_MODEL`. Setting `OPENAI_BASE_URL` points OpenAI at a compatible
endpoint (Ollama, vLLM, OpenRouter, …). See [`src/source.ts`](./src/source.ts).

Each step writes its context under `tmp/workflow-quickstart/`; delete it
for a fresh start.
