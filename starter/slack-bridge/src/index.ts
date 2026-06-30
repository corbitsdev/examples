import {
  App,
  Assistant,
  LogLevel,
  type SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import type {
  AppMentionEvent,
  Block,
  GenericMessageEvent,
  KnownBlock,
} from "@slack/types";
import { WebClient } from "@slack/web-api";

export type SlackBlock = KnownBlock | Block;

export type Write = (text: string) => void;

export type SlackPostMessage = {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: SlackBlock[];
};

export type SlackEvent = AppMentionEvent | GenericMessageEvent;

export type SlashCommand = SlackCommandMiddlewareArgs["command"];

export type SlackAssistantThread = {
  teamId?: string;
  channel: string;
  threadTs: string;
  userId?: string;
};

export type SlackAssistantMessage = SlackAssistantThread & {
  prompt: string;
};

export type SlackBlockAction = {
  actionId: string;
  value?: string;
  teamId?: string;
  userId?: string;
  channelId?: string;
  messageTs?: string;
};

export type SlackConnectionConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  appToken?: string;
};

export type SlackBridgeConfig = SlackConnectionConfig & {
  serviceName: string;
  stdout: Write;
  stderr: Write;
  onEvent: (teamId: string | undefined, event: SlackEvent) => void | Promise<void>;
  onSlashCommand?: (command: SlashCommand) => void | Promise<void>;
  onBlockAction?: (action: SlackBlockAction) => void | Promise<void>;
  onAssistantThreadStarted?: (
    thread: SlackAssistantThread,
  ) => void | Promise<void>;
  onAssistantUserMessage?: (
    message: SlackAssistantMessage,
  ) => void | Promise<void>;
};

export function resolveSlackConnection(
  env: NodeJS.ProcessEnv,
  opts: { defaultPort?: number } = {},
):
  | {
      config: SlackConnectionConfig;
      error?: undefined;
    }
  | { config?: undefined; error: string } {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  const botToken = env.SLACK_BOT_TOKEN;
  const appToken = env.SLACK_APP_TOKEN;

  if (signingSecret === undefined || signingSecret === "") {
    return { error: "SLACK_SIGNING_SECRET is not set.\n" };
  }
  if (botToken === undefined || botToken === "") {
    const appTokenNote =
      appToken === undefined || appToken === ""
        ? ""
        : " The xapp token is an app-level token; this starter still needs the xoxb Bot User OAuth Token to post replies.";
    return {
      error:
        "SLACK_BOT_TOKEN is not set. Install the app and export its xoxb token." +
        appTokenNote +
        "\n",
    };
  }

  const portText = env.PORT ?? String(opts.defaultPort ?? 3001);
  const port = Number(portText);
  if (!/^[0-9]+$/.test(portText) || port <= 0 || port > 65535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  return {
    config: {
      port,
      signingSecret,
      botToken,
      appToken: appToken === "" ? undefined : appToken,
    },
  };
}

export async function startSlackBridge(
  config: SlackBridgeConfig,
): Promise<void> {
  const app = new App({
    token: config.botToken,
    signingSecret: config.signingSecret,
    socketMode: config.appToken !== undefined,
    appToken: config.appToken,
    logLevel: LogLevel.INFO,
  });

  if (config.onAssistantUserMessage !== undefined) {
    app.assistant(
      new Assistant({
        threadStarted: async ({ payload, context }) => {
          const thread = toSlackAssistantThread(context.teamId, payload);
          if (thread !== undefined) {
            await dispatch(config, () =>
              config.onAssistantThreadStarted?.(thread),
            );
          }
        },
        userMessage: async ({ payload, context }) => {
          const message = toSlackAssistantMessage(context.teamId, payload);
          if (message !== undefined) {
            await dispatch(config, () =>
              config.onAssistantUserMessage?.(message),
            );
          }
        },
      }),
    );
  }

  app.event("app_mention", async ({ event, context }) => {
    await dispatch(config, () =>
      config.onEvent(context.teamId, event as SlackEvent),
    );
  });

  app.message(async ({ message, context }) => {
    await dispatch(config, () =>
      config.onEvent(context.teamId, message as SlackEvent),
    );
  });

  if (config.onSlashCommand !== undefined) {
    app.command(/.*/, async ({ command, ack }) => {
      await ack({
        response_type: "ephemeral",
        text: "Got it. I will answer in this channel.",
      });
      await dispatch(config, () => config.onSlashCommand?.(command));
    });
  }

  if (config.onBlockAction !== undefined) {
    app.action(/.*/, async ({ body, action, ack, context }) => {
      await ack();
      await dispatch(config, () =>
        config.onBlockAction?.(
          toSlackBlockAction(context.teamId, body, action),
        ),
      );
    });
  }

  await app.start(config.port);
  config.stdout(startupText(config));
}

async function dispatch(
  config: SlackBridgeConfig,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    config.stderr(`${config.serviceName}: ${message}\n`);
  }
}

function startupText(config: SlackBridgeConfig): string {
  if (config.appToken !== undefined) {
    return [
      `${config.serviceName} connected to Slack with Socket Mode`,
      "HTTP receiver: not required for Slack events in Socket Mode",
      "",
    ].join("\n");
  }

  return [
    `${config.serviceName} listening on port ${config.port}`,
    `Slack receiver: http://localhost:${config.port}/slack/events`,
    "Socket Mode:    off (set SLACK_APP_TOKEN to enable)",
    "",
  ].join("\n");
}

export async function postMessage(
  botToken: string,
  message: SlackPostMessage,
): Promise<{ channel: string; ts: string }> {
  const client = new WebClient(botToken);
  const result = await client.chat.postMessage(message);

  if (result.channel === undefined || result.ts === undefined) {
    throw new Error(
      `Slack chat.postMessage failed: ${result.error ?? "unknown error"}`,
    );
  }

  return { channel: result.channel, ts: result.ts };
}

export function cleanSlackText(text: string): string {
  return text
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]+)?>/g, "")
    .replace(/\*Sent using\*.*$/gim, "")
    .trim();
}

export function truncateForSlack(text: string): string {
  return text.length > 39000 ? text.slice(0, 38997) + "..." : text;
}

export function header(text: string): SlackBlock {
  return {
    type: "header",
    text: { type: "plain_text", text },
  };
}

export function section(text: string): SlackBlock {
  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
}

export function actions(elements: unknown[]): SlackBlock {
  return {
    type: "actions",
    elements,
  } as SlackBlock;
}

export function button(opts: {
  text: string;
  actionId: string;
  value: string;
  style?: "primary" | "danger";
}): unknown {
  return {
    type: "button",
    text: { type: "plain_text", text: opts.text },
    style: opts.style,
    action_id: opts.actionId,
    value: opts.value,
  };
}

function toSlackBlockAction(
  contextTeamId: string | undefined,
  body: unknown,
  action: unknown,
): SlackBlockAction {
  const actionRecord = asRecord(action);
  const bodyRecord = asRecord(body);
  const user = asRecord(bodyRecord.user);
  const channel = asRecord(bodyRecord.channel);
  const message = asRecord(bodyRecord.message);
  const container = asRecord(bodyRecord.container);
  const team = asRecord(bodyRecord.team);

  return {
    actionId: stringValue(actionRecord.action_id) ?? "",
    value: stringValue(actionRecord.value),
    teamId: stringValue(team.id) ?? contextTeamId,
    userId: stringValue(user.id),
    channelId: stringValue(channel.id),
    messageTs: stringValue(message.ts) ?? stringValue(container.message_ts),
  };
}

function toSlackAssistantThread(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantThread | undefined {
  const payloadRecord = asRecord(payload);
  const assistantThread = asRecord(payloadRecord.assistant_thread);
  const context = asRecord(assistantThread.context);
  const channel = stringValue(assistantThread.channel_id);
  const threadTs = stringValue(assistantThread.thread_ts);
  if (channel === undefined || threadTs === undefined) return undefined;

  return {
    teamId: stringValue(context.team_id) ?? contextTeamId,
    channel,
    threadTs,
    userId: stringValue(assistantThread.user_id),
  };
}

function toSlackAssistantMessage(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantMessage | undefined {
  const payloadRecord = asRecord(payload);
  const channel = stringValue(payloadRecord.channel);
  const threadTs = stringValue(payloadRecord.thread_ts);
  const prompt = cleanSlackText(stringValue(payloadRecord.text) ?? "");
  if (channel === undefined || threadTs === undefined || prompt === "") {
    return undefined;
  }

  return {
    teamId: contextTeamId,
    channel,
    threadTs,
    userId: stringValue(payloadRecord.user),
    prompt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
