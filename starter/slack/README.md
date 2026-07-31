# Slack starters

Run an Interchange agent or workflow from Slack.

## Install

From the repository root:

```bash
git submodule update --init interchange corbits-tag
bun install
```

## Interchange agent

```bash
cd starter/slack/agent
cp .env.example .env
bun run start
```

Import `agent/manifest.slack.json`, set the Events API Request URL to
`https://<public-host>/api/tag/slack/webhook`, and install the app. Mention
`@interchange`, then reply in the same thread to continue the conversation.

### Agent environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SLACK_SIGNING_SECRET` | Yes | Verify requests from Slack's Events API |
| `SLACK_BOT_TOKEN` | Yes | Read messages and post replies |
| `ANTHROPIC_API_KEY` | Yes | Run the Interchange agent model |
| `ANTHROPIC_MODEL` | No | Override the default Anthropic model |
| `PORT` | No | Change the HTTP server port from `3001` |
| `PUBLIC_BASE_URL` | No | Record the public tunnel URL used to configure Slack |

`agent/.env.example` also keeps commented extension options for Socket Mode
(`SLACK_APP_TOKEN`), OpenAI (`OPENAI_API_KEY`, `OPENAI_BASE_URL`), Google
(`GOOGLE_API_KEY`), and automatic provider selection (`INTX_PROVIDER`,
`INTX_MODEL`). The minimal agent does not read those options; enable the
matching transport or provider in `cli.ts` before using them.

## Workflow

```bash
cd starter/slack/workflows/approval-flow
cp .env.example .env
bun run start
```

Import its `manifest.slack.json`, enable Socket Mode, and provide
`SLACK_APP_TOKEN` with the other variables in its `.env.example`.

```text
Slack message -> draft -> approval buttons -> approve/reject -> final reply
```

## Packages

| Path | Purpose |
| --- | --- |
| `agent/` | Minimal Interchange agent with HTTP mention and thread follow-up |
| `workflows/approval-flow/` | Interactive Slack workflow |
