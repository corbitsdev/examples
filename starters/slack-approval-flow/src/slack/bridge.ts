import { App, Assistant, LogLevel } from "@slack/bolt";

import type { SlackConnectionConfig } from "./connection";
import {
  toSlackAssistantMessage,
  toSlackAssistantThread,
  toSlackBlockAction,
  type SlackAssistantMessage,
  type SlackAssistantThread,
  type SlackBlockAction,
  type SlackEvent,
  type SlashCommand,
} from "./events";

export type Write = (text: string) => void;

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
