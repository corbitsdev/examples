import { join } from "node:path";

import { createMemoryState } from "@chat-adapter/state-memory";
import {
  mountSlackTag,
  type TagEvent,
  type TagThread,
} from "@corbits/tag-slack";
import { defineAgent, type AuthorizeFn } from "@intx/agent";
import { Hono } from "hono";

import { runAgentTurn } from "./agent";
import { resolveSource, type Source } from "./source";

const EXAMPLE_NAME = "slack-agent";
const DEMO_AGENT_PROMPT =
  "You are Corbits, a concise demo agent replying in Slack. Keep replies useful, direct, and easy to read in a thread.";

type Write = (text: string) => void;

export type SlackAgentConfig = {
  signingSecret: string;
  botToken: string;
  port: number;
  source: Source;
  contextRoot: string;
  authorize: AuthorizeFn;
};

export type MainOptions = {
  stdout?: Write;
  stderr?: Write;
  contextRoot?: string;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  opts: MainOptions = {},
): Promise<number> {
  const stdout = opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr = opts.stderr ?? ((text: string) => void process.stderr.write(text));

  if (argv.includes("--help") || argv.includes("-h")) {
    stdout(helpText());
    return 0;
  }

  const config = resolveConfig(env, opts.contextRoot);
  if (config.error !== undefined) {
    stderr(config.error);
    return 1;
  }

  const definition = defineAgent({
    id: "slack-demo-agent",
    systemPrompt: DEMO_AGENT_PROMPT,
    tools: [],
    capabilities: [],
    inference: { sources: [config.source] },
  });

  const answer = async (event: TagEvent, thread: TagThread): Promise<void> => {
    try {
      const reply = await runAgentTurn(
        config,
        definition,
        event.text,
        event.threadId,
      );
      await thread.post(reply);
    } catch (error) {
      stderr(`${EXAMPLE_NAME}: ${errorMessage(error)}\n`);
      throw error;
    }
  };

  try {
    const app = new Hono();
    const { path } = mountSlackTag(app, {
      userName: "corbits",
      state: createMemoryState(),
      slack: {
        botToken: config.botToken,
        signingSecret: config.signingSecret,
      },
      onTag: answer,
      onThreadMessage: answer,
      thinkingIndicator: true,
    });

    Bun.serve({ port: config.port, fetch: app.fetch });
    stdout(
      `Corbits agent listening on http://localhost:${config.port}${path}\n`,
    );
    return 0;
  } catch (error) {
    stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

function helpText(): string {
  return [
    "usage: bun run start",
    "",
    "Required env:",
    "  SLACK_SIGNING_SECRET",
    "  SLACK_BOT_TOKEN",
    "  one provider key: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY",
    "",
  ].join("\n");
}

function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
):
  | (SlackAgentConfig & { error?: undefined })
  | { error: string } {
  const signingSecret = env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) return { error: "SLACK_SIGNING_SECRET is required.\n" };

  const botToken = env.SLACK_BOT_TOKEN?.trim();
  if (!botToken) return { error: "SLACK_BOT_TOKEN is required.\n" };

  const sourceResult = resolveSource(env);
  if (sourceResult.error !== undefined) return { error: sourceResult.error };

  const portText = env.PORT ?? "3001";
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  return {
    signingSecret,
    botToken,
    port,
    source: sourceResult.source,
    contextRoot:
      contextRootOverride ?? join(process.cwd(), "tmp", EXAMPLE_NAME, "context"),
    authorize: denyAgentTools,
  };
}

async function denyAgentTools(): ReturnType<AuthorizeFn> {
  return { effect: "deny", matchingGrants: [], resolvedBy: null };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
