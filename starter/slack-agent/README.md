# Slack agent

Run an Interchange agent behind Corbits Tag's Slack HTTP ingress. App
mentions start a conversation, and replies in the same Slack thread continue
it without another mention.

This directory is self-contained. Interchange comes from npm, while the
unpublished Corbits Tag packages are pinned in
`vendor/corbits-tag` as a git submodule.

## Setup

From the repository root, initialize the starter's vendored dependency:

```bash
git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag
```

Then install the starter and create its local environment file:

```bash
cd starter/slack-agent
bun install --frozen-lockfile
cp .env.example .env
```

Replace `https://your-public-tunnel.example` in
[`manifest.slack.json`](./manifest.slack.json) with the public HTTPS URL that
forwards to this starter, then import the manifest into a dedicated Slack app.
Its Events API Request URL must end with:

```text
/api/tag/slack/webhook
```

Install the app, then fill `.env` with its signing secret and bot token plus one
model-provider API key. Start the server and verify the Events API Request URL
in Slack:

```bash
bun run start
```

Invite `@interchange` to a channel, then mention it. Each Slack thread gets its
own durable Interchange context under `tmp/slack-agent/context/`. Reinstall the
Slack app whenever its OAuth scopes change.

Corbits Tag keeps thread subscriptions and event deduplication in process-local
memory in this starter. Replace `createMemoryState()` in `src/cli.ts` with a
durable Chat SDK state adapter before running multiple instances.

## Providers

Set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`. Use
`INTX_PROVIDER` and `INTX_MODEL` to force a provider or model. See
[`src/source.ts`](./src/source.ts).

## Dependency layout

`@corbits/tag-slack` declares its internal `@corbits/tag-core` dependency with
Bun's `workspace:*` protocol. This starter is therefore a small workspace whose
only members are the packages inside its vendored Tag submodule. The repository
root remains free of package-manager workspace machinery.

To update Corbits Tag, check out the reviewed commit inside
`vendor/corbits-tag`, stage the gitlink, regenerate `bun.lock`, and rerun the
validation commands below.

## Validation

```bash
bun install --frozen-lockfile
bun run typecheck
bun build src/cli.ts --target=bun --outdir /tmp/corbits-slack-agent-build
```
