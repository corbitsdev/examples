import { createMemoryState } from "@chat-adapter/state-memory";
import { mountSlackTag } from "@corbits/tag-slack";
import { Hono } from "hono";

import { resolveConfig, SERVICE_NAME } from "./config";
import { createCommunityPulseSessions } from "./session";

export type MainOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  contextRoot?: string;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  options: MainOptions = {},
): Promise<number> {
  const stdout =
    options.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr =
    options.stderr ?? ((text: string) => void process.stderr.write(text));
  if (argv.includes("--help") || argv.includes("-h")) {
    stdout(
      "usage: bun run start\n\nStart the report-only Slack weekly community pulse workflow.\n",
    );
    return 0;
  }

  const resolved = resolveConfig(env, options.contextRoot);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }

  const sessions = createCommunityPulseSessions(resolved.config, stderr);
  const app = new Hono();
  const mounted = mountSlackTag(app, {
    userName: "interchange-community-pulse",
    state: createMemoryState(),
    slack: {
      botToken: resolved.config.botToken,
      signingSecret: resolved.config.signingSecret,
    },
    subscribeOnMention: false,
    onTag: sessions.start,
  });

  try {
    Bun.serve({ port: resolved.config.port, fetch: app.fetch });
  } catch (error) {
    stderr(`${message(error)}\n`);
    return 1;
  }
  stdout(
    `${SERVICE_NAME} listening on http://localhost:${resolved.config.port}${mounted.path}\n`,
  );
  return await new Promise<never>(() => undefined);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
