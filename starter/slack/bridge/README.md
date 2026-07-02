# Slack bridge

Reusable Slack transport for the Slack starters under `starter/slack`.

This package owns only the Slack SDK boundary:

- starts a Bolt app
- receives app mentions, messages, slash commands, and Block Kit actions
- posts messages through Slack Web API
- exposes small text helpers for Slack-formatted messages
- exposes a generic workflow adapter that maps Slack starts and Block Kit
  action IDs into example-owned workflow handlers
- exposes a generic Slack thread session store for examples that need to track
  active work per thread

It does not know about specific agents, workflow definitions, approval signals,
or terminal states. `starter/slack/agent` and
`starter/slack/workflows/approval-flow` both consume this package and decide
what each Slack event means for their own demo.
