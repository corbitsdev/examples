# slack-agent

A starter Slack bridge for Interchange-style agents and workflows. Slack
events are handled with the Slack Bolt SDK, then the app decides what to
do with each event: call an agent, start a workflow, send a workflow
signal, or call an Interchange Hub route.

The code follows the same clear split as OpenTag:

- `src/cli.ts` is one direct-agent demo entrypoint.
- `../slack-bridge` is reusable Slack transport built on `@slack/bolt`,
  `@slack/types`, and Slack's Web API client.
- `src/agent.ts` is a small helper for running any `AgentDefinition`
  against one Slack conversation context with an explicit authorizer.
- `src/source.ts` resolves the model provider from env.

Create or update a Slack app from `manifest.slack.json`, then run this
starter locally with Socket Mode enabled. Secrets are not checked in. The app
reads `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, and `SLACK_BOT_TOKEN` from
the environment.

## What It Shows

- Letting Slack Bolt own request verification, Socket Mode, events, and
  slash-command acks.
- Responding to app mentions, DMs, and follow-up replies in Slack threads.
- Responding to Slack Assistant user messages.
- Responding to a `/demo-agent` slash command.
- Calling Slack Web API `chat.postMessage` with the bot token.
- Keeping one agent context per Slack thread under `tmp/slack-agent/context`.

The shared Slack bridge does not define the agent brain or the workflow. It only
verifies and receives Slack traffic, chooses which messages should be
handled, and posts replies. The direct-agent demo passes a normal
`AgentDefinition` into `runAgentTurn`; `starter/slack-workflow` uses
the same bridge with Block Kit buttons and maps Slack actions onto workflow
signals.

That is the intended extension point:

```ts
await startSlackBridge({
  // Slack config...
  onEvent: async (teamId, event) => {
    // Option A: run any AgentDefinition.
    // Option B: start a workflow.
    // Option C: send a signal to a waiting workflow.
    // Option D: call Interchange Hub REST APIs.
  },
});
```

The direct-agent demo uses an agent with no tools and a fail-closed
authorization callback for tool calls. If you add tools to the agent, pass an
authorizer that matches the Slack users, channels, and actions you want to
allow.

## Setup

From the repo root:

```bash
git submodule update --init interchange
bun install
```

Then enter this starter directory:

```bash
cd starter/slack-agent
cp .env.example .env
```

Fill in:

```bash
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
ANTHROPIC_API_KEY=sk-...
```

`SLACK_APP_TOKEN` is the app-level token. It is not enough to post
messages. This starter also needs the Bot User OAuth Token
(`SLACK_BOT_TOKEN`, starting with `xoxb-...`) from Slack's install flow.

With Socket Mode enabled, Slack connects over Bolt's managed socket and
you do not need a public tunnel. If you turn Socket Mode off and use
HTTP Event Subscriptions, open a public tunnel to the local server:

```bash
ngrok http 3001
```

## Slack App Configuration

Use [`manifest.slack.json`](./manifest.slack.json) as the starter
manifest in Slack's **App Manifest** page.

For Socket Mode, enable these app settings:

```text
Socket Mode: on
App Home messages tab: on
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
commands
chat:write
groups:history
im:history
im:read
im:write
mpim:history
mpim:read
mpim:write
```

After changing scopes, install or reinstall the app to the workspace and
copy the `xoxb-...` bot token into `.env`.

## Running

```bash
bun run start
```

With Socket Mode enabled, Slack sends events over the Bolt-managed
socket connection and you do not need a public tunnel. If you turn
Socket Mode off, point Slack Event Subscriptions and Slash Commands at
the Bolt receiver exposed by the process, for example
`https://your-public-tunnel.example/slack/events`.

Then use it from Slack:

```text
@interchange explain what this channel is about
DM interchange: write a short standup update
Open the Slack Assistant pane and ask interchange a question
```

Follow-up replies in a channel thread work without mentioning the bot
only after `message.channels` or `message.groups` has been added in
Slack and the app has been reinstalled. Without those events, mention
`@interchange` again in the thread.

## Providers

The model provider is picked from environment variables:

| Provider            | Key                                 | Default model       |
| ------------------- | ----------------------------------- | ------------------- |
| `anthropic`         | `ANTHROPIC_API_KEY`                 | `claude-sonnet-4-6` |
| `openai`            | `OPENAI_API_KEY`                    | `gpt-4o-mini`       |
| `openai-compatible` | `OPENAI_API_KEY` + `OPENAI_BASE_URL`| `gpt-4o-mini`       |
| `google`            | `GOOGLE_API_KEY` / `GEMINI_API_KEY` | `gemini-2.0-flash`  |

Set `INTX_PROVIDER` and `INTX_MODEL` to force a provider or model.
