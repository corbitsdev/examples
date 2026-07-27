<p align="center">
  <a href="https://corbits.dev">
    <h3 align="center">Corbits Examples</h3>
  </a>
</p>

Enjoy our curated collection of examples and solutions. Use these patterns to build your own robust and scalable applications on Corbits.

Four directories, with clear rules about what belongs in each:

| Directory | Rule |
| --- | --- |
| [`starter/`](/starter) | Minimal quickstarts. The smallest runnable program for one idea, with no inference required to understand it. |
| [`modules/`](/modules) | One entry per `@corbits/*` module: mount it on an Interchange host and prove it works. Integration proofs, not products. |
| [`solutions/`](/solutions) | Agent-driven and end-to-end. An agent doing a job a person would otherwise do, against real infrastructure. |
| [`packages/`](/packages) | Shared scaffolding for the examples themselves — the Interchange host, the assertion helpers, the inference resolver. Never the lesson. |

The distinction between the last two matters: `modules/` answers "does this
package mount?", `solutions/` answers "is it useful to an agent?".

## Getting set up

The `@intx/*` Interchange packages come from npm, pinned at `0.2.2` in the
root `package.json` catalog — the version the three `@corbits/*` cores declare
as their peer. The cores themselves are not on npm yet, so this repo vendors
them as git submodules and resolves them as bun workspace members:

```sh
git submodule update --init --recursive
bun install
```

`bun install` also builds the three `@corbits/*` cores (their `dist/` is
gitignored). Re-run it after checking a submodule out at a new commit.

| Submodule | Provides |
| --- | --- |
| `cores/mailbox` | `@corbits/mailbox-core` |
| `cores/artifacts` | `@corbits/artifact-core` |
| `cores/analytics` | `@corbits/analytics-core` |

Then:

```sh
bun run typecheck    # every example
bun run modules      # all five modules/ entries, against a real Postgres
```

The `modules/` entries and `solutions/inbox-triage` need a Postgres — see the
[modules README](/modules) for a one-liner that starts one.

## Inference: configured, never assumed

The agent-shaped examples take their inference configuration from the
environment. This repo ships **no default provider, endpoint or model** — run
one unconfigured and it exits immediately telling you what to export, rather
than guessing at something that happens to be installed.

| Variable | Meaning |
| --- | --- |
| `INTX_BASE_URL` | Endpoint root. |
| `INTX_MODEL` | Model id served there. **Always required.** |
| `INTX_API_KEY` | Credential. Endpoints that ignore it still need a placeholder. |
| `INTX_PROVIDER` | Wire protocol: `anthropic`, `openai`, `openai-compatible`, `google-genai`. Optional — defaults to `openai-compatible`. |
| `ANTHROPIC_API_KEY` `OPENAI_API_KEY` `GOOGLE_API_KEY` `GEMINI_API_KEY` | Conventional vendor keys. Any one supplies the credential and implies that vendor's endpoint and protocol; `INTX_MODEL` is still required. |

`INTX_BASE_URL` wins over a vendor key. Model ids are never defaulted — they
move faster than this repo does, so `INTX_MODEL` is the one value you always
name yourself.

Start from [`.env.example`](/.env.example), which has a block per provider with
none of them active:

```sh
cp .env.example .env       # uncomment exactly one block, then
set -a; . ./.env; set +a   # export it into your shell
```

Or export directly. A local [Ollama](https://ollama.com) — no account, no key
that anyone checks:

```sh
ollama serve                                  # if it is not already running
ollama pull qwen2.5vl:7b                      # or any chat model you like
export INTX_BASE_URL=http://localhost:11434/v1
export INTX_MODEL=qwen2.5vl:7b
export INTX_API_KEY=ollama                    # Ollama ignores it; the field is required
```

A hosted vendor:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export INTX_MODEL=claude-sonnet-4-6
```

Anything else that speaks the OpenAI wire format — vLLM, LM Studio, OpenRouter,
a gateway of your own — is the same three variables:

```sh
export INTX_BASE_URL=https://openrouter.ai/api/v1
export INTX_MODEL=meta-llama/llama-3.3-70b-instruct
export INTX_API_KEY=sk-or-...
```

There is no vendor branch anywhere in the runtime: `provider` selects one of the
wire-format adapters `@intx/inference` ships, and the other three fields are
configuration handed straight through. See
[`@corbits/example-kit`](/packages/example-kit/src/inference.ts) — the whole
resolver is one file, and it names no default endpoint.

Then run any agent example:

```sh
cd starter/agent-quickstart && bun run start "name three planets"
cd starter/workflow-quickstart && bun run start "the rings of Saturn"
cd solutions/inbox-triage && bun run start
```

## What each example keeps for itself

The examples share a host, assertion helpers and the inference resolver, all
from [`@corbits/example-kit`](/packages/example-kit). They do **not** share the
mount. Every `modules/` entry keeps its own `src/app.ts` holding the `mountX`
call and the seams that host supplies — the identity resolver, the content
store, the triage vocabulary — because those are the decisions an adopter has
to make, and hiding them behind a helper would defeat the point.

`src/index.ts` next to it is the proof: it drives the app in-process and
asserts. `bun run serve` binds the same app to a port.

## Adding a new example

Each example should be self-contained and include:

- A `.gitignore`
- A `package.json` with the license set to `MIT`
- A `README.md` with a short description and, if it requires environment variables, a `.env.example` file and instructions on how to set them up

## Read the Docs

- [Corbits Docs](https://docs.corbits.dev)
- [Faremeter Docs](https://docs.faremeter.xyz)

If you have any questions or suggestions about the docs, feel free to [open a discussion](https://github.com/corbitsdev/examples/discussions), or [submit a PR](https://github.com/corbitsdev/examples/pulls) with your suggestions!

## Provide Feedback

- [Start a Discussion](https://github.com/corbitsdev/examples/discussions) with a question, piece of feedback, or idea you want to share with the team.
- [Open an Issue](https://github.com/corbitsdev/examples/issues) if you believe you've encountered a bug that you want to flag for the team.
