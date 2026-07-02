# Slack approval workflow

A Slack Block Kit approval workflow example built on the shared
`../../bridge` transport.

The workflow remains defined in the stacked
[`../../../workflow-approval-flow/src/workflow.ts`](../../../workflow-approval-flow/src/workflow.ts)
starter:

```text
draft -> await approve -> publish
```

This example owns the approval lifecycle:

- starts the approval workflow from an app mention, DM, or Slack Assistant
  message
- posts the draft with Block Kit approval buttons
- maps Approve to `run.signal("approve", payload)`
- maps Reject to `run.cancel(...)`
- posts the final published result or terminal status back to Slack

The shared bridge owns Slack plumbing and generic workflow routing.
Approval-specific buttons, signals, cancellation, and terminal states stay in
this example.

Use the top-level [Slack starter README](../../README.md) for setup, Slack app
configuration, and provider selection.

## Running

```bash
cd starter/slack/workflows/approval-flow
bun run start
```

Then use it from Slack:

```text
@interchange-workflow write a short launch note for the approval workflow demo
Open the Slack Assistant pane and ask interchange-workflow for an approval draft
```
