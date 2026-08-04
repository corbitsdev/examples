# slack-community-pulse

A report-only Slack workflow where two Interchange analysts collect and filter
their own public X evidence in parallel, then a reporter merges their findings:

```text
Slack mention or DM
  ├─> Community Listener -> x_get_user_mentions ─┐
  └─> Content Analyst    -> x_get_user_posts ─────┴─> Pulse Reporter -> Slack
```

Each analyst must call its assigned read-only X tool before its workflow step
can complete. The workflow cannot post, reply, like, or otherwise mutate X. It
analyzes only public likes, replies, reposts, quotes, and post text. Collection
is capped at two 100-item pages per endpoint and compares adjacent seven-day
periods.

## Stacked dependencies

This example is intentionally stacked on the Slack post-to-X change. The only
code dependency it shares with the preceding stack is:

- the pinned Corbits Tag workspace at
  `../slack-agent/vendor/corbits-tag`;

There is no `vendor/` directory in this example. It does not add another
submodule, shared bridge, or root workspace change. Provider resolution,
exports, workflow code, X tools/client, configuration, sessions, and Slack
entrypoint are all isolated inside `starter/slack-community-pulse`. Interchange
packages come from npm at `0.2.2`.

## Setup

1. Clone with submodules and install from this directory:

   ```bash
   git clone --recurse-submodules https://github.com/corbitsdev/examples.git
   cd examples/starter/slack-community-pulse
   bun install
   cp .env.example .env
   ```

   For an existing clone, initialize the shared Corbits Tag checkout first:

   ```bash
   git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag
   ```

2. Replace the public URL in `manifest.slack.json`, create the Slack app from
   that manifest, and install it.

3. Fill `.env` with Slack credentials, the four read-only X OAuth credentials,
   and one supported inference-provider key.

4. Expose port `3001` through HTTPS and start the worker:

   ```bash
   bun run start
   ```

The Slack Events API URL is:

```text
POST https://your-public-host/api/tag/slack/webhook
```

Mention the Corbits bot in a channel or send it a DM:

```text
@corbits-community-pulse generate the weekly community pulse for @corbitsdev
```

Set `X_COMMUNITY_HANDLE` when prompts should be allowed to omit the handle.
Slack state and active-run ownership are process-local; restarting the worker
clears them.

## Local checks

```bash
bun install --frozen-lockfile
bun run typecheck
bun build src/cli.ts --target=bun --outdir=tmp/build
bun run start --help
```
