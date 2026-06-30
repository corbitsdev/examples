// Slack adapter for workflow-approval-flow.

import { startSlackBridge } from "@corbits/example-slack-bridge";

import { createSlackWorkflowAdapter } from "./adapter";
import { resolveConfig, SERVICE_NAME } from "./config";

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
      [
        "usage: bun run start",
        "",
        "Start the Slack Block Kit adapter for workflow-approval-flow.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const resolved = resolveConfig(env, opts.contextRoot);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }

  const adapter = createSlackWorkflowAdapter({
    config: resolved.config,
    stderr,
  });

  try {
    await startSlackBridge({
      serviceName: SERVICE_NAME,
      port: resolved.config.port,
      signingSecret: resolved.config.signingSecret,
      botToken: resolved.config.botToken,
      appToken: resolved.config.appToken,
      stdout,
      stderr,
      onEvent: adapter.onEvent,
      onBlockAction: adapter.onBlockAction,
      onAssistantUserMessage: adapter.onAssistantUserMessage,
    });
  } catch (error) {
    stderr(`${errorMessage(error)}\n`);
    return 1;
  }

  return await new Promise<never>(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
