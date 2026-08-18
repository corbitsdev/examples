import { join } from "node:path";

import { resolveSource, type Source } from "./source";
import { kind } from "./workflow";
import { createPublisher, type Publisher } from "./x-client";

export const SERVICE_NAME = kind;

export type PostToXConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  source: Source;
  contextRoot: string;
  publisher: Publisher;
};

export type ResolveConfigResult =
  | { config: PostToXConfig; error?: undefined }
  | { config?: undefined; error: string };

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
): ResolveConfigResult {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return { error: "SLACK_SIGNING_SECRET is not set.\n" };

  const botToken = env.SLACK_BOT_TOKEN;
  if (!botToken) return { error: "SLACK_BOT_TOKEN is not set.\n" };

  const portText = env.PORT ?? "3001";
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  const source = resolveSource(env);
  if (source.error !== undefined) return { error: source.error };

  let publisher: Publisher;
  try {
    publisher = createPublisher(env);
  } catch (error) {
    return { error: `${message(error)}\n` };
  }

  return {
    config: {
      port,
      signingSecret,
      botToken,
      source: source.source,
      contextRoot: contextRootOverride ?? join(process.cwd(), "tmp", kind),
      publisher,
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
