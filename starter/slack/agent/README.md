# Interchange agent for Slack

A minimal Interchange agent on Slack, connected through Corbits Tag.

## Run

From the repository root:

```bash
git submodule update --init interchange corbits-tag
bun install
cd starter/slack/agent
cp .env.example .env
bun run start
```

Import `manifest.slack.json` into a dedicated Slack app. Set its Events API
Request URL to:

```text
https://<public-host>/api/tag/slack/webhook
```

Install the app, invite `@interchange` to a channel, then:

1. Mention it: `@interchange write a short standup update`.
2. Reply without mentioning it in the same thread to continue the conversation.

Thread subscriptions use process-local memory and reset when the process restarts.
Agent conversation contexts remain under `tmp/slack-agent/context`.
