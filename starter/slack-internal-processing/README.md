# slack-internal-processing

A Slack thread workflow that turns an uploaded call transcript into a structured
digest with a two-step Corbits workflow:

    @app mention → upload transcript.txt → summarize → extract → Slack digest thread

The thread collects a full `.txt` transcript; its filename becomes the call title. The summarize step
produces a concise summary and discussion points. The extract step identifies
companies and discrete claims. Every status and digest card stays in the
original mention thread.

This is a deliberately small example adapted from Scout's
internal-processing workflow. It does not include Granola ingestion, the Scout
knowledge database, artifacts, fact checking, PDFs, or run-diligence actions.

## Setup

1. Clone the repository with submodules and install this starter:

       git clone --recurse-submodules https://github.com/corbitsdev/examples.git
       cd examples/starter/slack-internal-processing
       bun install
       cp .env.example .env

   In an existing checkout, initialize the shared Corbits Tag dependency from
   the repository root:

       git submodule update --init --recursive starter/slack-agent/vendor/corbits-tag

2. Expose port 3001 through an HTTPS tunnel.

3. Replace every placeholder URL in manifest.slack.json with:

       https://your-public-tunnel.example/api/tag/slack/webhook

4. Create or update a Slack app from manifest.slack.json and reinstall it.
   The webhook receives mentions and subscribed thread replies.

5. Set SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, and one inference provider key
   in .env.

6. Start the service:

       bun run start

## Use it

1. In a Slack channel, mention the app:

       @corbits-internal-processing create a digest

2. In the thread the bot opens, upload the full transcript as a UTF-8 `.txt`
   file. There is no modal input limit. Its filename becomes the title:

       acme-investor-call.txt

3. The bot posts "Call digest started" and then the structured digest in that
   same thread. Re-mention the app to run another digest after the thread
   unsubscribes.

## Verify locally

    bun run typecheck
    bun test
    bun build src/cli.ts --target=bun --outdir /tmp/slack-internal-processing-build

## Files

| Path | Purpose |
| --- | --- |
| src/cli.ts | Corbits Tag mount and thread-reply intake handlers |
| src/session.ts | Slack-thread lifecycle and workflow run |
| src/workflow.ts | summarize → extract definition and real step invoker |
| src/parser.ts | Strict validation of the extracted digest |
| src/cards.ts | Status and final digest cards |
| manifest.slack.json | Slack events and scopes |
| ../slack-agent/vendor/corbits-tag | Shared pinned Corbits Tag workspace |
