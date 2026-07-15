// slack-agent: a Slack bridge that routes events to one example @intx/agent.

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  cleanSlackText,
  postMessage,
  resolveSlackConnection,
  startSlackBridge,
  truncateForSlack,
  type SlackConnectionConfig,
  type SlackEvent,
  type SlackAssistantMessage,
  type SlashCommand,
  type Write,
} from "@corbits/example-slack-bridge";
import { defineAgent, type AuthorizeFn } from "@intx/agent";

import { agentContextDir, runAgentTurn } from "./agent";
import { resolveSource, type Source } from "./source";

const EXAMPLE_NAME = "slack-agent";
const DEMO_AGENT_PROMPT =
  "You are interchange, a concise Corbits demo agent replying in Slack. Keep replies useful, direct, and easy to read in a thread.";

export type SlackAgentConfig = SlackConnectionConfig & {
  source: Source;
  contextRoot: string;
  authorize: AuthorizeFn;
};

export type MainOptions = {
  stdout?: Write;
  stderr?: Write;
  contextRoot?: string;
};

type AgentReplyRequest = {
  prompt: string;
  channel: string;
  threadTs?: string;
  conversationKey: string;
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

  try {
    await startSlackBridge({
      serviceName: EXAMPLE_NAME,
      port: config.port,
      signingSecret: config.signingSecret,
      botToken: config.botToken,
      appToken: config.appToken,
      stdout,
      stderr,
      onEvent: (teamId, event) => {
        const request = requestFromSlackEvent(teamId, event, config);
        if (request !== undefined) void replyWithAgent(config, request, stderr);
      },
      onSlashCommand: (command) => {
        const request = requestFromSlashCommand(command);
        if (request !== undefined) void replyWithAgent(config, request, stderr);
      },
      onAssistantUserMessage: (message) => {
        void replyWithAgent(config, requestFromAssistantMessage(message), stderr);
      },
    });
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  return await new Promise<never>(() => undefined);
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

function requestFromSlashCommand(
  command: SlashCommand,
): AgentReplyRequest | undefined {
  const prompt = command.text?.trim() ?? "";
  const channel = command.channel_id;
  if (channel === undefined || prompt === "") return undefined;

  return {
    prompt,
    channel,
    conversationKey: [
      command.team_id,
      command.channel_id,
      command.user_id,
      "slash",
    ].join("-"),
  };
}

function requestFromAssistantMessage(
  message: SlackAssistantMessage,
): AgentReplyRequest {
  return {
    prompt: message.prompt,
    channel: message.channel,
    threadTs: message.threadTs,
    conversationKey: [
      message.teamId,
      message.channel,
      message.threadTs,
      message.userId ?? "assistant",
    ].join("-"),
  };
}

function requestFromSlackEvent(
  teamId: string | undefined,
  event: SlackEvent,
  config: SlackAgentConfig,
): AgentReplyRequest | undefined {
  const channel = event.channel;
  const prompt = cleanSlackText(event.text ?? "");
  if (channel === undefined || prompt === "") return undefined;
  if (!shouldHandleSlackEvent(teamId, event, config)) return undefined;

  const threadTs = event.thread_ts ?? event.ts;
  return {
    prompt,
    channel,
    threadTs,
    conversationKey: [teamId, channel, threadTs ?? event.user ?? "event"].join("-"),
  };
}

function shouldHandleSlackEvent(
  teamId: string | undefined,
  event: SlackEvent,
  config: SlackAgentConfig,
): boolean {
  if (event.bot_id !== undefined || event.subtype !== undefined) return false;
  if (event.type === "app_mention") return true;
  if (event.type !== "message") return false;

  const channel = event.channel ?? "";
  if (channel.startsWith("D")) return true;

  const threadTs = event.thread_ts;
  if (threadTs === undefined) return false;

  const conversationKey = [teamId, channel, threadTs].join("-");
  return existsSync(agentContextDir(config.contextRoot, conversationKey));
}

async function replyWithAgent(
  config: SlackAgentConfig,
  request: AgentReplyRequest,
  stderr: Write,
): Promise<void> {
  try {
    const agent = defineAgent({
      id: "slack-demo-agent",
      systemPrompt: DEMO_AGENT_PROMPT,
      tools: [],
      capabilities: [],
      inference: { sources: [config.source] },
    });
    const text = await runAgentTurn(
      config,
      agent,
      request.prompt,
      request.conversationKey,
    );
    await postMessage(config.botToken, {
      channel: request.channel,
      thread_ts: request.threadTs,
      text: truncateForSlack(text),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${EXAMPLE_NAME}: ${message}\n`);
    await postMessage(config.botToken, {
      channel: request.channel,
      thread_ts: request.threadTs,
      text: `I hit an error while answering: ${message}`,
    }).catch(() => undefined);
  }
}

function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
):
  | (SlackAgentConfig & { error?: undefined })
  | { error: string } {
  const slack = resolveSlackConnection(env);
  if (slack.error !== undefined) return { error: slack.error };

  const sourceResult = resolveSource(env);
  if (sourceResult.error !== undefined) return { error: sourceResult.error };

  return {
    ...slack.config,
    source: sourceResult.source,
    authorize: denyAgentTools,
    contextRoot:
      contextRootOverride ?? join(process.cwd(), "tmp", EXAMPLE_NAME, "context"),
  };
}

async function denyAgentTools(): ReturnType<AuthorizeFn> {
  return { effect: "deny", matchingGrants: [], resolvedBy: null };
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
