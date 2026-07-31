/**
 * Run one Interchange agent behind Corbits Tag's Slack HTTP ingress.
 *
 * Corbits Tag owns Slack signature verification, event normalization, thread
 * subscriptions, and threaded replies. This file owns the Interchange agent:
 * its inference source, per-thread context, and the callback that turns a
 * normalized Slack message into an agent reply.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { createMemoryState } from "@chat-adapter/state-memory";
import {
  mountSlackTag,
  type TagEvent,
  type TagThread,
} from "@corbits/tag-slack";
import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type Agent,
  type BaseEnv,
} from "@intx/agent";
import { createIsogitStore } from "@intx/storage-isogit";
import { Hono } from "hono";

const signingSecret = process.env.SLACK_SIGNING_SECRET;
if (!signingSecret) throw new Error("SLACK_SIGNING_SECRET is required");

const botToken = process.env.SLACK_BOT_TOKEN;
if (!botToken) throw new Error("SLACK_BOT_TOKEN is required");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const source = {
  id: `anthropic:${model}`,
  provider: "anthropic",
  baseURL: "https://api.anthropic.com",
  apiKey,
  model,
};
const definition = defineAgent({
  id: "slack-agent",
  systemPrompt:
    "You are interchange, a concise and helpful agent replying in Slack.",
  tools: [],
  capabilities: [],
  inference: { sources: [source] },
});

// Interchange conversation context is separate from the Chat SDK thread state
// configured below. Each Slack thread gets one agent and one isogit-backed
// context directory, so its model conversation survives process restarts.
const contextRoot = join(process.cwd(), "tmp", "slack-agent", "context");
const agents = new Map<string, Promise<Agent>>();

function agentFor(threadId: string): Promise<Agent> {
  const key = threadId.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
  let agent = agents.get(key);

  if (!agent) {
    const contextDir = join(contextRoot, key);
    mkdirSync(contextDir, { recursive: true });
    agent = createIsogitStore(contextDir).then((storage) =>
      createAgent(definition, {
        sources: [source],
        defaultSource: source.id,
        storage,
        workdir: contextDir,
        audit: storage,
        authorize: async () => ({
          effect: "deny",
          matchingGrants: [],
          resolvedBy: null,
        }),
        directors: createDefaultDirectorRegistry(),
      } satisfies BaseEnv),
    );
    agents.set(key, agent);
  }

  return agent;
}

const answer = async (event: TagEvent, thread: TagThread) => {
  const agent = await agentFor(event.threadId);
  const { reply } = await agent.send(event.text);
  await thread.post(reply);
};

// Chat SDK state stores thread subscriptions, deduplication keys, locks,
// queues, and cache. Memory keeps this starter dependency-free, but it is
// process-local: subscriptions reset on restart and locks do not coordinate
// multiple instances. Replace it with any Chat SDK StateAdapter—Redis,
// ioredis, PostgreSQL, Cloudflare Agents, or your own implementation—without
// changing the Interchange agent or the Corbits Tag callbacks above.
//
// Vercel Chat SDK state-adapter docs:
// https://chat-sdk.dev/docs/state-adapters
const threadState = createMemoryState();

const app = new Hono();
const { path } = mountSlackTag(app, {
  userName: "interchange",
  state: threadState,
  slack: { botToken, signingSecret },
  onTag: answer,
  onThreadMessage: answer,
  thinkingIndicator: true,
});

const portText = process.env.PORT ?? "3001";
const port = Number(portText);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`PORT="${portText}" is not a valid port`);
}
Bun.serve({ port, fetch: app.fetch });
console.log(`Interchange agent listening on http://localhost:${port}${path}`);
