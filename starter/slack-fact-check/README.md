# slack-fact-check

A sourced fact-check workflow driven from Slack through Corbits Tag:

```text
Slack mention or DM -> extract claims -> verify with web research -> sourced verdicts
```

The first agent turns a message into discrete claims. The second agent checks
each claim with Exa web search and, when configured, Firecrawl page fetching.
The bot replies in the same Slack thread with `confirmed`, `contradicted`, or
`unverifiable` verdicts and named source links.

This is a deliberately small workflow adapted from Scout's fact-check flow. It
does not include Scout's knowledge database, document ingestion, artifact
engine, PDF pipeline, hub, or sidecar.

This starter builds on the Corbits Tag dependency introduced by the Slack agent
starter. It uses npm `@intx/*` packages at `0.2.2` and consumes the shared,
pinned Corbits Tag checkout at `../slack-agent/vendor/corbits-tag` as a Bun
workspace. It does not register or clone a second submodule.

## Setup

1. Clone the repository with its submodules and install this starter:

   ```bash
   git clone --recurse-submodules https://github.com/corbitsdev/examples.git
   cd examples/starter/slack-fact-check
   bun install
   cp .env.example .env
   ```

   For an existing clone, initialize the shared Corbits Tag submodule from the
   repository root:

   ```bash
   git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag
   ```

2. Expose port `3001` through an HTTPS tunnel. Use this Slack Events API
   request URL:

   ```text
   https://your-public-tunnel.example/api/tag/slack/webhook
   ```

3. Create a Slack app from `manifest.slack.json`, set that request URL, and
   install the app in the workspace.

4. Populate `.env` with `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`,
   `EXA_API_KEY`, and one provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
   or `GOOGLE_API_KEY`. `FIRECRAWL_API_KEY` is optional; without it, the
   workflow still verifies with Exa excerpts but cannot open full pages.

5. Start the HTTP server:

   ```bash
   bun run start
   ```

The server listens on:

```text
POST /api/tag/slack/webhook
```

## Use it

Mention the bot in a channel or send it a DM:

```text
@slack-fact-check Verify whether OpenAI was founded in 2015
```

The bot posts a start card, runs `extract -> verify`, and posts the sourced
report in the same Slack thread. Step context is written under
`tmp/slack-fact-check/`. Delete that directory for a fresh start.

Run `bun run typecheck` for local verification.

## Files

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | HTTP server and Corbits Tag mount |
| `src/session.ts` | Slack-thread lifecycle and workflow run state |
| `src/cards.ts` | Chat SDK status and result cards |
| `src/workflow.ts` | `extract -> verify` workflow and real step invoker |
| `src/web-research.ts` | Exa search and optional Firecrawl page tools |
| `src/parser.ts` | Strict validation for sourced fact-check reports |
| `src/source.ts` | Provider selection from environment variables |
| `../slack-agent/vendor/corbits-tag` | Shared pinned Corbits Tag workspace introduced by the base change |
