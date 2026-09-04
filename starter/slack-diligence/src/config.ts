import { join } from "node:path";

import { resolveSource } from "./source";
import type { Source, WebResearchConfig } from "./types";

export const SERVICE_NAME = "slack-diligence";
const RESEARCH_MAX_TOKENS = 32_000;
const DRAFT_MAX_TOKENS = 120_000;

export type SlackDiligenceConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  sources: { research: Source; draft: Source };
  webResearch: WebResearchConfig;
  contextRoot: string;
};

type ConfigResult =
  | { config: SlackDiligenceConfig; error?: undefined }
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
  const exaApiKey = required(env, "EXA_API_KEY");
  if (exaApiKey === undefined) return { error: "EXA_API_KEY is not set.\n" };
  const firecrawlApiKey = required(env, "FIRECRAWL_API_KEY");

  const portText = env.PORT ?? "3001";
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  const research = resolveSource(env, env.RESEARCH_MODEL, RESEARCH_MAX_TOKENS);
  if (research.error !== undefined) return { error: research.error };
  const draft = resolveSource(env, env.DRAFT_MODEL, DRAFT_MAX_TOKENS);
  if (draft.error !== undefined) return { error: draft.error };

  return {
    config: {
      port,
      signingSecret,
      botToken,
      sources: { research: research.source, draft: draft.source },
      webResearch: {
        exaApiKey,
        ...(firecrawlApiKey !== undefined && { firecrawlApiKey }),
      },
      contextRoot:
        contextRootOverride ?? join(process.cwd(), "tmp", SERVICE_NAME),
    },
  };
}
