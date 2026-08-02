# slack-agent

Run an Interchange agent from Slack. App mentions, DMs, Slack Assistant
threads, follow-up replies in a thread the agent already knows, and a
`/demo-agent` slash command all route to one agent, and the reply is
posted back into the same thread.

This directory is self-contained. Every dependency comes from npm —
`@intx/*` at `0.2.2` — and nothing here imports from anywhere else in
this repository. Copy the directory anywhere, `bun install`, and it
runs.

## What's here

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | Entry point: config, event → prompt mapping, posting replies |
| `src/agent.ts` | One agent per Slack thread, backed by an isogit context store |
| `src/source.ts` | Provider resolution from the environment |
| `src/slack/` | The Slack transport: connection config, Bolt wiring, event parsing, message helpers |

`src/slack/` is Slack plumbing and `src/cli.ts` + `src/agent.ts` are the
agent behavior. That separation is a reading aid within this starter,
not a package boundary — see the note on duplication at the bottom.

## Setup

```bash
cd starter/slack-agent
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
@interchange explain what this channel is about
DM interchange: write a short standup update
Open the Slack Assistant pane and ask interchange a question
/demo-agent summarize this channel
```

Each Slack thread gets its own agent context under
`tmp/slack-agent/context/`; delete that directory for a fresh start.

## Providers

Use whichever provider key you have: `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, or `GOOGLE_API_KEY`. Set `INTX_PROVIDER` and
`INTX_MODEL` to force a provider or model. See
[`src/source.ts`](./src/source.ts).

Type-check with `bun run typecheck`.

## A note on duplication

`src/slack/` and `src/source.ts` are duplicated with the other starters
rather than shared. That is on purpose: a starter is only useful if you
can copy the one directory you are reading and have working code. Do not
factor these back into a common package.
