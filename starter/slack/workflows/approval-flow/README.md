# Slack approval workflow

A Slack approval workflow built on Corbits Tag and Interchange.

The workflow remains defined in the stacked
[`../../../workflow-approval-flow/src/workflow.ts`](../../../workflow-approval-flow/src/workflow.ts)
starter:

```text
draft -> await approve -> publish
```

This example owns the approval lifecycle:

- starts the approval workflow from an app mention or DM
- posts the draft with Chat SDK approval buttons
- maps Approve to `run.signal("approve", payload)`
- maps Reject to `run.cancel(...)`
- posts the final published result or terminal status back to Slack

`mountSlackTag` owns Slack signature verification, webhook routing, and event
normalization. The returned Chat SDK bot handles its platform-specific button
actions and rich cards. Approval signals, cancellation, and run state stay in
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
```
