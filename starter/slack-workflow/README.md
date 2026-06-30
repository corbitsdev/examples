# slack-workflow

A Slack Block Kit adapter for the `workflow-approval-flow` starter.

The workflow remains defined in
[`../workflow-approval-flow/src/workflow.ts`](../workflow-approval-flow/src/workflow.ts):

```text
draft -> await approve -> publish
```

This package owns the Slack surface:

- starts the approval workflow from an app mention or DM
- starts the approval workflow from a Slack Assistant user message
- posts the draft with Block Kit approval buttons
- maps Approve to `run.signal("approve", payload)`
- maps Reject to `run.cancel(...)`

The shared Slack transport lives in `../slack-bridge`; this package only
maps Slack events onto the approval workflow lifecycle.

## Setup

From the repo root:

```bash
git submodule update --init interchange
bun install
```

Then enter this starter directory:

```bash
cd starter/slack-workflow
cp .env.example .env
```

Fill in:

```bash
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
ANTHROPIC_API_KEY=sk-...
```

`SLACK_APP_TOKEN` is the app-level token for Socket Mode.
`SLACK_BOT_TOKEN` is the Bot User OAuth Token, starting with `xoxb-...`.

Provider selection matches `workflow-approval-flow`: Anthropic, OpenAI,
OpenAI-compatible endpoints, and Google Gemini are supported through
the `INTX_PROVIDER`, `INTX_MODEL`, and provider-specific env vars.

## Slack App Configuration

Use [`manifest.slack.json`](./manifest.slack.json) as the starter
manifest in Slack's **App Manifest** page.

For Socket Mode, enable these app settings:

```text
Socket Mode: on
Interactivity: on
Event Subscriptions bot events:
  app_mention
  message.channels
  message.groups
  message.im
  message.mpim
  assistant_thread_started
  assistant_thread_context_changed
```

The bot scopes are:

```text
app_mentions:read
assistant:write
channels:history
chat:write
groups:history
im:history
im:read
im:write
mpim:history
mpim:read
mpim:write
```

After changing scopes or interactivity, install or reinstall the app to
the workspace and copy the `xoxb-...` bot token into `.env`.

## Running

```bash
bun run start
```

With Socket Mode enabled, Slack sends events and button actions over the
Bolt-managed socket connection. If you turn Socket Mode off, point Slack
Event Subscriptions and Interactivity at the Bolt receiver exposed by
the process, for example `https://your-public-tunnel.example/slack/events`.

Then use it from Slack:

```text
@interchange-workflow write a short launch note for the approval workflow demo
Open the Slack Assistant pane and ask interchange-workflow for an approval draft
```

The adapter will:

1. start `workflow-approval-flow`
2. run the `draft` step
3. post the draft in the thread with Approve and Reject buttons
4. signal the workflow and run `publish`, or cancel it
5. post the final published result or terminal status

Approvals happen through Slack interactivity, so the app needs Interactivity
enabled and the Block Kit buttons must be available in the posted draft.
