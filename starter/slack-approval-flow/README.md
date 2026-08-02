# slack-approval-flow

A human-in-the-loop approval workflow driven from Slack:

```text
Slack message -> draft -> approval buttons -> approve/reject -> final reply
```

An app mention, DM, or Slack Assistant message starts a run. The draft is
posted back into the thread with Block Kit Approve / Reject buttons.
Approve delivers `run.signal("approve", payload)` and the publish step
executes; Reject calls `run.cancel(...)`. The published result — or the
terminal status if the run ended some other way — lands in the same
thread.

This directory is self-contained. Every dependency comes from npm —
`@intx/*` at `0.2.2` — and nothing here imports from anywhere else in
this repository. Copy the directory anywhere, `bun install`, and it
runs.

## What's here

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | Entry point |
| `src/config.ts` | Slack + provider configuration from the environment |
| `src/adapter.ts` | Routes Slack events and button clicks into the session store |
| `src/session.ts` | The approval lifecycle: one run per Slack thread |
| `src/blocks.ts` | The approval UI — Block Kit payloads for each state |
| `src/workflow.ts` | The workflow itself: `draft -> awaitSignal("approve") -> publish` |
| `src/source.ts` | Provider resolution from the environment |
| `src/slack/` | The Slack transport: connection config, Bolt wiring, event parsing, message helpers, thread session store, generic workflow adapter |

## Setup

```bash
cd starter/slack-approval-flow
bun install
cp .env.example .env
```

Fill in:

```bash
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
ANTHROPIC_API_KEY=...
```

Import [`manifest.slack.json`](./manifest.slack.json) in Slack, enable
Socket Mode, install (or reinstall) the app, then:

```bash
bun run start
```

Socket Mode needs no public tunnel. Without it, point Slack Event
Subscriptions, Slash Commands, and Interactivity at
`https://your-public-tunnel.example/slack/events` and leave
`SLACK_APP_TOKEN` unset.

## Using it

```text
@interchange-workflow write a short launch note for the approval workflow demo
Open the Slack Assistant pane and ask interchange-workflow for an approval draft
```

Step context is written under `tmp/slack-approval-flow/`; delete that
directory for a fresh start.

## Providers

Use whichever provider key you have: `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, or `GOOGLE_API_KEY`. Set `INTX_PROVIDER` and
`INTX_MODEL` to force a provider or model. See
[`src/source.ts`](./src/source.ts).

Type-check with `bun run typecheck`.

## A note on duplication

`src/slack/`, `src/workflow.ts` and `src/source.ts` are duplicated with
the other starters rather than shared. That is on purpose: a starter is
only useful if you can copy the one directory you are reading and have
working code. Do not factor these back into a common package.
