import { join } from "node:path";

import {
  resolveSource,
  type Source,
} from "./source";
import { kind } from "./workflow";
import {
  createXCommunityClient,
  type XCommunityClient,
} from "./x-client";

export const SERVICE_NAME = kind;

export type CommunityPulseConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  source: Source;
  xClient: XCommunityClient;
  defaultHandle?: string;
  contextRoot: string;
};

export type ResolveConfigResult =
  | { config: CommunityPulseConfig; error?: undefined }
  | { config?: undefined; error: string };

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
): ResolveConfigResult {
  const signingSecret = env.SLACK_SIGNING_SECRET?.trim();
  const botToken = env.SLACK_BOT_TOKEN?.trim();
  if (!signingSecret || !botToken) {
    return { error: "SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are required.\n" };
  }

  const port = Number(env.PORT ?? "3001");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${env.PORT ?? ""}" is not valid.\n` };
  }

  const xKeys = [
    "X_API_KEY",
    "X_API_SECRET",
    "X_ACCESS_TOKEN",
    "X_ACCESS_TOKEN_SECRET",
  ] as const;
  const missing = xKeys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    return { error: `${missing.join(", ")} must be set for read-only X access.\n` };
  }

  const source = resolveSource(env);
  if (source.error !== undefined) return { error: source.error };

  const defaultHandle = env.X_COMMUNITY_HANDLE?.trim().replace(/^@/u, "");
  if (defaultHandle && !/^[A-Za-z0-9_]{1,15}$/u.test(defaultHandle)) {
    return { error: "X_COMMUNITY_HANDLE is not a valid X username.\n" };
  }

  return {
    config: {
      port,
      signingSecret,
      botToken,
      source: source.source,
      xClient: createXCommunityClient({
        apiKey: env.X_API_KEY!.trim(),
        apiSecret: env.X_API_SECRET!.trim(),
        accessToken: env.X_ACCESS_TOKEN!.trim(),
        accessTokenSecret: env.X_ACCESS_TOKEN_SECRET!.trim(),
      }),
      ...(defaultHandle ? { defaultHandle } : {}),
      contextRoot:
        contextRootOverride ?? join(process.cwd(), "tmp", SERVICE_NAME),
    },
  };
}
