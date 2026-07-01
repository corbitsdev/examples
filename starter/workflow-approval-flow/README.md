# workflow-approval-flow

A runnable human-in-the-loop `@intx/workflow` example:

```text
draft -> await approve -> publish
```

It is the local CLI version of the seeded Interchange `approval-flow`.
The workflow runs a draft step, pauses on an approval signal, then
resumes only after the local operator approves.

## What it shows

- `awaitSignal({ name: "approve" })` as a real permission gate.
- Final workflow outputs kept on stdout, with progress and policy logs
  on stderr so the command remains pipe-friendly.
- A visible workflow authorization hook before each step invocation.
- `run.signal("approve", payload)` and `run.cancel(...)` as local
  control-plane operations.

## Setup

From the repo root:

```bash
git submodule update --init interchange
bun install
```

Set any supported provider key:

```bash
export ANTHROPIC_API_KEY=sk-...
```

Provider selection matches `workflow-quickstart`: Anthropic, OpenAI,
OpenAI-compatible endpoints, and Google Gemini are supported through
the `INTX_PROVIDER`, `INTX_MODEL`, and provider-specific env vars.

## Running

Interactive approval:

```bash
cd starter/workflow-approval-flow
bun run start "write a short launch note for the approval workflow demo"
```

The draft step runs first. When the CLI prints:

```text
Approve this draft? Type "approve" to publish or "reject" to cancel.
approval>
```

type `approve` to deliver the signal and run `publish`, or `reject` to
cancel the workflow.

Unattended demo:

```bash
bun run start --auto-approve "write a short launch note for the approval workflow demo"
```

Rejection path:

```bash
bun run start --reject "write a launch note that should not publish"
```

To start with fresh step context:

```bash
rm -rf tmp/workflow-approval-flow
```
