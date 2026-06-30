# slack-bridge

Reusable Slack transport for the Slack starters.

This package owns only the Slack SDK boundary:

- starts a Bolt app
- receives app mentions, messages, slash commands, and Block Kit actions
- posts messages through Slack Web API
- exposes small text helpers for Slack-formatted messages

It does not know about agents or workflows. `starter/slack-agent` and
`starter/slack-workflow` both consume this package and decide what each
Slack event means for their own demo.
