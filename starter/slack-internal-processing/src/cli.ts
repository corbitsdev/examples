import { createMemoryState } from "@chat-adapter/state-memory";
import { mountSlackTag } from "@corbits/tag-slack";
import { Chat, type Message } from "chat";
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
    onTag: async (event) => {
      const thread = chat.thread(event.threadId);
      await sessions.requestTranscript(event.threadId, thread, async () => {
        await thread.post(callDigestIntakeCard());
      });
    },
  });
  if (!(mounted.bot instanceof Chat)) {
    throw new Error("mountSlackTag did not return its Chat SDK bot");
  }
  const chat = mounted.bot.registerSingleton();

  chat.onSubscribedMessage(async (thread, message: Message) => {
    if (message.author.isMe) return;
    await sessions.acceptTranscriptFile(
      message.threadId,
      message.attachments,
      thread,
    );
  });

  try {
    // Initialize the adapter before accepting traffic so the first mention or
    // subscribed thread reply does not wait on bot authentication.
    await chat.initialize();
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
