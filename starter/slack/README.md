# Slack starters

Run an Interchange agent or workflow from Slack.

## Run One

From the repo root:

```bash
git submodule update --init interchange
bun install
```

Pick an example and copy its env file:

```bash
cd starter/slack/agent
cp .env.example .env
```

or:

```bash
cd starter/slack/workflows/approval-flow
cp .env.example .env
```

Fill in:

```bash
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
ANTHROPIC_API_KEY=...
```

Import the example's `manifest.slack.json` in Slack, enable Socket Mode,
install or reinstall the app, then run:

```bash
bun run start
```

Socket Mode does not need a public tunnel. Without Socket Mode, point Slack
Event Subscriptions, Slash Commands, and Interactivity at
`https://your-public-tunnel.example/slack/events`.

## Examples

| Example | Path | Try in Slack |
| --- | --- | --- |
| Agent | `starter/slack/agent` | `@interchange explain this channel` |
| Approval workflow | `starter/slack/workflows/approval-flow` | `@interchange-workflow write a launch note` |

## Workflow Shape

The approval workflow follows this path:

```text
Slack message -> draft -> approval buttons -> approve/reject -> final reply
```

Approve sends a workflow signal. Reject cancels the run. The final result is
posted back into the same Slack thread.

## Where Things Live

| Path | Purpose |
| --- | --- |
| `bridge/` | Shared Slack plumbing |
| `agent/` | Direct Slack agent example |
| `workflows/approval-flow/` | Slack approval workflow example |

## Providers

Use whichever provider key you have configured: `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, or `GOOGLE_API_KEY`. Set `INTX_PROVIDER` and `INTX_MODEL` to
force a provider or model.
