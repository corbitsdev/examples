# Slack Team Grill

Run an adaptive “Grill Me” decision session in a Slack thread. The app asks one
question at a time, presents exactly three options with one recommendation,
and accepts the first valid button click as the immutable team decision. It
keeps asking dependent questions until the original request is coherent and
actionable, then posts the final report in the same thread.

Example mention:

```text
@corbits-team-grill grill us on choosing our first customer segment and the proof our demo must show
```

Question 1 appears directly; there is no separate startup message.

## Architecture

| Layer | Responsibility |
| --- | --- |
| `src/workflow.ts` | Prompts, adaptive workflow graph, `awaitSignal`, and agent invocation |
| `@corbits/tag-slack` | Slack signature verification, HTTP webhook mounting, and normalized mention events |
| Mounted Chat SDK `Chat` | Slack-specific typed cards, editable messages, and button `onAction` callbacks |
| This package | Per-thread session state, first-click locking, workflow signaling, and final delivery |

`TagEvent` starts a session, but the portable `TagThread` API only posts text.
Team Grill therefore uses the mounted Chat SDK bot as the intentional
platform escape hatch for cards, buttons, and message edits.

Like the other stacked Slack starters, this package reuses the shared Corbits
Tag checkout at `../slack-agent/vendor/corbits-tag`; it adds no submodule.

```text
Slack Events + Interactivity
             |
             v
POST /api/tag/slack/webhook
             |
             v
mountSlackTag -> TagEvent -> Team Grill session -> Interchange workflow
       |
       +-> mounted Chat -> cards / onAction / message edit
```

## Setup

1. Initialize the shared, pinned Corbits Tag dependency introduced by the
   Slack agent starter:

   ```bash
   git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag
   ```

2. Create a Slack app by importing [`manifest.slack.json`](manifest.slack.json).

3. Configure both Slack request fields to the exact same public HTTPS URL:

   ```text
   Events API Request URL:    https://<public-host>/api/tag/slack/webhook
   Interactivity Request URL: https://<public-host>/api/tag/slack/webhook
   ```

4. Install the app to the intended workspace. Reinstall it whenever manifest
   scopes change; Slack does not add new scopes to an existing installation.

5. Copy the environment template and start the HTTP worker:

   ```bash
   cd starter/slack-team-grill
   bun install
   cp .env.example .env
   bun run start
   ```

The manifest requests only `app_mentions:read` and `chat:write`, subscribes only
to `app_mention`, enables Interactivity, and disables Socket Mode. No runtime
`SLACK_APP_TOKEN` is used.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SLACK_SIGNING_SECRET` | Yes | Verify Slack HTTP Events and Interactivity requests |
| `SLACK_BOT_TOKEN` | Yes | Post cards, edit finalized questions, and post reports |
| One provider API key | Yes | Use `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY` |
| `PORT` | No | Local HTTP port; defaults to `3001` |
| `PUBLIC_BASE_URL` | Setup only | Records the public tunnel origin used in Slack; the worker does not read it |
| `INTX_PROVIDER` | No | Select `anthropic`, `openai`, `openai-compatible`, or `google` |
| `INTX_MODEL` | No | Override the selected provider model |
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | No | Anthropic endpoint/model overrides |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | No | OpenAI or OpenAI-compatible endpoint/model overrides |
| `GOOGLE_BASE_URL`, `GOOGLE_MODEL` | No | Google Gemini endpoint/model overrides |

## Guarantees and limits

- One active grill is allowed per Slack thread.
- Every question has exactly three options and one visible recommendation.
- The first valid click wins; duplicate, stale, cross-thread, and forged
  actions do not mutate the decision.
- The number of rounds is adaptive, not fixed. Every new round receives all
  finalized decisions.
- A generated report is delivered without waiting for `run.complete`; rich
  delivery is time-bounded and retries as plain text.
- Cards, Chat SDK state, and active sessions are process-local demo state. A
  restart loses in-progress sessions; this example does not implement durable
  recovery or multi-instance coordination.

Team discussion remains visible in Slack, but ambient thread messages and
free-text votes do not finalize choices. Decisions happen only through the
three buttons.

## Checks

```bash
bun run --cwd starter/slack-team-grill test
bun run --cwd starter/slack-team-grill typecheck
bun build starter/slack-team-grill/src/cli.ts \
  --target=bun --outdir /tmp/corbits-team-grill-build
```

Automated checks do not prove Slack configuration. A real verification must
confirm the HTTP mention, button callback, message edit, multiple adaptive
rounds, and automatic same-thread final report.
