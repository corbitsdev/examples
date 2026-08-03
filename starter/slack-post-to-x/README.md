# Slack post-to-X workflow

Draft, validate, approve, and optionally publish an X post from Slack. Dry-run
is the default and cannot create a public post.

```text
draft agent -> validation action -> approval signal -> publish action
```

Only `draft` uses inference. The validation action trims and NFC-normalizes the
text, then applies a dependency-free 280-code-point guard. The approval card
labels this as a local character count because X applies its own final weighted
validation. The publish action receives the validation action's workflow output,
not text from Slack.

This directory is self-contained. It uses npm `@intx/*` packages at `0.2.2`
and vendors the unpublished Corbits Tag repository as a starter-local Git
submodule and Bun workspace. It does not import another example or depend on
repository-root workspace machinery.

## Setup

1. Clone the repository with submodules and install this starter:

   ```bash
   git clone --recurse-submodules https://github.com/corbitsdev/examples.git
   cd examples/starter/slack-post-to-x
   bun install
   cp .env.example .env
   ```

   For an existing clone, initialize this starter's submodule first:

   ```bash
   git submodule update --init --recursive starter/slack-post-to-x/vendor/corbits-tag
   ```

2. Replace both `https://your-public-tunnel.example` values in
   `manifest.slack.json` with the same HTTPS tunnel URL.

3. Create and install a Slack app from the manifest. Add
   `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, and one model-provider key to
   `.env`.

4. Start the HTTP server:

   ```bash
   bun run start
   ```

Events and Interactivity share one endpoint:

```text
https://<public-host>/api/tag/slack/webhook
```

Mention `@interchange-social` with a drafting request. Approve to receive a
dry-run receipt in the same thread or Reject to cancel.

## Live publishing

Live mode requires `X_LIVE=1` and all four OAuth values. Missing credentials
fail startup rather than silently changing modes. Approval sends the exact text
shown in Slack to X.

The publish action has one attempt and no automatic retry. If the request or a
successful response cannot establish a receipt, its outcome is reported as
unknown; inspect X before starting another live run. A real Slack or X run
requires separate authorization.

Approval state and the local workflow effect ledger are process-local. Restart
the request after a worker restart; durable recovery is outside this starter.

Run `bun run typecheck` for local verification.
