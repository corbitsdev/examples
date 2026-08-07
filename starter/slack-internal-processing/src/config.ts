import { join } from "node:path";

import { resolveSource } from "./source";
import type { Source } from "./types";

export const SERVICE_NAME = "slack-internal-processing";

export type SlackCallDigestConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  source: Source;
  contextRoot: string;
};

type ConfigResult =
  | { config: SlackCallDigestConfig; error?: undefined }
  | { config?: undefined; error: string };

function required(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
): ConfigResult {
  const signingSecret = required(env, "SLACK_SIGNING_SECRET");
  if (signingSecret === undefined) {
    return { error: "SLACK_SIGNING_SECRET is not set.\n" };
  }
  const botToken = required(env, "SLACK_BOT_TOKEN");
  if (botToken === undefined) {
    return { error: "SLACK_BOT_TOKEN is not set.\n" };
  }

  const portText = env.PORT ?? "3001";
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  const source = resolveSource(env);
  if (source.error !== undefined) return { error: source.error };

  return {
    config: {
      port,
      signingSecret,
      botToken,
      source: source.source,
      contextRoot:
        contextRootOverride ?? join(process.cwd(), "tmp", SERVICE_NAME),
    },
  };
}
