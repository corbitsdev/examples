# slack-diligence

A sourced diligence snapshot workflow driven from Slack through Corbits Tag:

```text
Slack mention or DM -> research -> draft -> Slack card + PDF
```

Send a company name and website. The research agent gathers public evidence with
Exa, the draft agent turns that into a sourced investment snapshot, and the bot
posts the card and a downloadable PDF in the same thread.

This is a deliberately small workflow adapted from Scout's diligence flow. It
does not include Scout's knowledge database, document ingestion, artifact
engine, portal, hub, or sidecar.

This starter builds on the Corbits Tag dependency introduced by the Slack agent
starter. It uses npm `@intx/*` packages at `0.2.2` and consumes the shared,
pinned Corbits Tag checkout at `../slack-agent/vendor/corbits-tag` as a Bun
workspace. It does not register or clone a second submodule.

## Setup

1. Clone the repository with its submodules and install this starter:

   ```bash
   git clone --recurse-submodules https://github.com/corbitsdev/examples.git
   cd examples/starter/slack-diligence
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
   install the app in the workspace. The manifest includes `files:write` for
   PDF delivery.

4. Populate `.env` with `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`,
   `EXA_API_KEY`, and one provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
   or `GOOGLE_API_KEY`. `FIRECRAWL_API_KEY` is optional; without it, research
   still uses Exa excerpts but cannot open full pages. `RESEARCH_MODEL` and
   `DRAFT_MODEL` only override the model name on that same provider.

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
@corbits-diligence Linear | https://linear.app
```

The bot posts a start card, runs `research -> draft`, posts the sourced
snapshot, and uploads a PDF in the same thread. Step context is written under
`tmp/slack-diligence/`. Delete that directory for a fresh start.

Run `bun run typecheck` for local verification. Run `bun test` for parser,
request, and web-research regressions.

## Files

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | HTTP server and Corbits Tag mount |
| `src/session.ts` | Slack-thread lifecycle and workflow run state |
| `src/cards.ts` | Chat SDK status and result cards |
| `src/workflow.ts` | `research -> draft` workflow and step invoker |
| `src/web-research.ts` | Exa search and optional Firecrawl page fetch |
| `src/parser.ts` | ArkType validation for snapshot JSON |
| `src/request.ts` | Company / website input parsing |
| `src/pdf.ts` | In-memory PDF render |
| `src/slack-upload.ts` | Slack `filesUploadV2` delivery |
| `src/source.ts` | Provider selection from environment variables |
| `../slack-agent/vendor/corbits-tag` | Shared pinned Corbits Tag workspace |
