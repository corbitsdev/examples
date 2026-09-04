import { createMemoryState } from "@chat-adapter/state-memory";
import { mountSlackTag } from "corbits-tag/slack";
import { Hono } from "hono";

import { callDigestIntakeCard } from "./cards";
import { resolveConfig, SERVICE_NAME } from "./config";
import { createCallDigestSessions } from "./session";

export type MainOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  contextRoot?: string;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  opts: MainOptions = {},
): Promise<number> {
  const stdout =
    opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr =
    opts.stderr ?? ((text: string) => void process.stderr.write(text));

  if (argv.includes("--help") || argv.includes("-h")) {
    stdout(
      "usage: bun run start\n\nStart the Slack thread-based call-digest workflow.\n",
    );
    return 0;
  }

  const resolved = resolveConfig(env, opts.contextRoot);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }

  const sessions = createCallDigestSessions(resolved.config, stderr);
  const app = new Hono();
  const mounted = mountSlackTag(app, {
    userName: "corbits-internal-processing",
    state: createMemoryState(),
    slack: {
      botToken: resolved.config.botToken,
      signingSecret: resolved.config.signingSecret,
    },
    acknowledge: true,
    thinkingIndicator: true,
    thinkingIndicatorText: "_Preparing call digest…_",
    subscribeOnMention: true,
    onTag: async (event, thread) => {
      await sessions.requestTranscript(event.threadId, thread, async () => {
        await thread.post(callDigestIntakeCard(), { convertMarkdown: false });
      });
    },
    onThreadMessage: async (event, thread) => {
      await sessions.acceptTranscriptFile(
        event.threadId,
        event.attachments ?? [],
        thread,
      );
    },
  });

  try {
    Bun.serve({ port: resolved.config.port, fetch: app.fetch });
  } catch (cause) {
    stderr(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 1;
  }

  stdout(
    `${SERVICE_NAME} listening on http://localhost:${resolved.config.port}${mounted.path}\n`,
  );
  return await new Promise<never>(() => undefined);
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
