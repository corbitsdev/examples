# Slack agent

A direct Slack agent example built on the shared `../bridge` transport.

This example owns the agent behavior:

- defines one demo `AgentDefinition`
- keeps one agent context per Slack thread under `tmp/slack-agent/context`
- responds to app mentions, DMs, Slack Assistant messages, follow-up thread
  replies, and `/demo-agent`

The shared bridge owns Slack plumbing. This example owns the agent brain.

Use the top-level [Slack starter README](../README.md) for setup, Slack app
configuration, and provider selection.

## Running

```bash
cd starter/slack/agent
bun run start
```

Then use it from Slack:

```text
@interchange explain what this channel is about
DM interchange: write a short standup update
Open the Slack Assistant pane and ask interchange a question
/demo-agent summarize this channel
```
