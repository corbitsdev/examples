import { join } from "node:path";

import { resolveSource, type Source } from "./source";

export const SERVICE_NAME = "slack-approval-flow";

export type SlackWorkflowConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  source: Source;
  contextRoot: string;
};

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
):
  | {
      config: SlackWorkflowConfig;
      error?: undefined;
    }
  | { config?: undefined; error: string } {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return { error: "SLACK_SIGNING_SECRET is not set.\n" };
  }

  const botToken = env.SLACK_BOT_TOKEN;
  if (!botToken) {
    return {
      error:
        "SLACK_BOT_TOKEN is not set. Install the app and export its xoxb token.\n",
    };
  }

  const portText = env.PORT ?? "3001";
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  const sourceResult = resolveSource(env);
  if (sourceResult.error !== undefined) return { error: sourceResult.error };

  return {
    config: {
      port,
      signingSecret,
      botToken,
      source: sourceResult.source,
      contextRoot:
        contextRootOverride ?? join(process.cwd(), "tmp", SERVICE_NAME),
    },
  };
}
