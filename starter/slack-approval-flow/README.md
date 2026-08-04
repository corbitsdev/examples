# slack-approval-flow

A human-in-the-loop Interchange workflow driven from Slack through Corbits Tag:

```text
Slack mention or DM -> draft -> approval card -> approve/reject -> final reply
```

`mountSlackTag` owns Slack signature verification, HTTP webhook routing, and
event normalization. This starter owns the workflow policy and session state:
it posts Chat SDK cards, handles `Button` actions with `onAction`, signals an
approval with `run.signal("approve", payload)`, and cancels a rejection with a
supported Interchange cancellation actor.

This starter builds on the Corbits Tag dependency introduced by the Slack agent
starter. It uses npm `@intx/*` packages at `0.2.2` and consumes the shared,
pinned Corbits Tag checkout at `../slack-agent/vendor/corbits-tag` as a Bun
workspace. The stacked change does not register or clone a second submodule.

## Setup

1. Clone the repository with its submodules and install this starter:

   ```bash
   git clone --recurse-submodules https://github.com/corbitsdev/examples.git
   cd examples/starter/slack-approval-flow
   bun install
   cp .env.example .env
   ```

   If the repository is already cloned, initialize the shared Corbits Tag
   submodule from the repository root:

   ```bash
   git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag
   ```

2. Expose port `3001` through an HTTPS tunnel. Replace both
   `https://your-public-tunnel.example` placeholders in
   [`manifest.slack.json`](./manifest.slack.json) with the tunnel's HTTPS URL.
   Both request URLs must end in `/api/tag/slack/webhook`.

3. Create a Slack app from the edited manifest and install it in the workspace.

4. Populate `.env` with `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, and one
   provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`.

5. Start the HTTP server:

   ```bash
   bun run start
   ```

6. In Slack's app settings, verify that both Event Subscriptions and
   Interactivity accept the same HTTPS webhook URL.

The server listens on:

```text
POST /api/tag/slack/webhook
```

## Use it

Mention the bot in a channel or send it a DM:

```text
@interchange-workflow write a short launch note for the approval workflow demo
```

The bot posts the draft with Approve and Reject buttons. Approval resumes the
workflow and publishes the result in the same Slack thread; rejection cancels
the run.

Step context is written under `tmp/slack-approval-flow/`. Delete that directory
for a fresh start. Type-check with `bun run typecheck`.

## Providers

Set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`.
[`src/source.ts`](./src/source.ts) selects the configured provider and also
supports `GEMINI_API_KEY` plus OpenAI-compatible endpoints through
`OPENAI_BASE_URL`. Use `INTX_PROVIDER` and `INTX_MODEL` to select explicitly.

## Files

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | HTTP server, Corbits Tag mount, and Chat SDK action registration |
| `src/session.ts` | Consumer-owned approval lifecycle and run state |
| `src/cards.ts` | Chat SDK cards and buttons |
| `src/workflow.ts` | `draft -> awaitSignal("approve") -> publish` workflow |
| `src/source.ts` | Provider selection from environment variables |
| `../slack-agent/vendor/corbits-tag` | Shared pinned Corbits Tag workspace introduced by the base change |
