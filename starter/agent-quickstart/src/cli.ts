// agent-quickstart: the smallest possible @intx/agent program.
//
// Define an inference source, point createAgent at a context directory,
// send one prompt, print the reply, close. Nothing else.
//
// This targets the published @intx/agent 0.1.2 API: a single
// createAgent({ ... }) call. When given a contextDir, the agent
// materialises an isogit-backed context + audit store inside it, so the
// only dependency this example declares is @intx/agent itself.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { createAgent } from "@intx/agent";

const EXAMPLE_NAME = "agent-quickstart";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export type MainOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  contextDir?: string;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  opts: MainOptions = {},
): Promise<number> {
  const stdout = opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr = opts.stderr ?? ((text: string) => void process.stderr.write(text));

  const prompt = argv.join(" ").trim();
  if (prompt === "") {
    stderr("usage: bun run start <prompt>\n");
    return 1;
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    stderr(
      "ANTHROPIC_API_KEY is not set. Export it and re-run:\n" +
        "  export ANTHROPIC_API_KEY=sk-...\n",
    );
    return 1;
  }

  const model = env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const source = {
    id: `anthropic:${model}`,
    provider: "anthropic",
    baseURL: "https://api.anthropic.com",
    apiKey,
    model,
  };

  const contextDir =
    opts.contextDir ?? join(process.cwd(), "tmp", EXAMPLE_NAME, "context");
  mkdirSync(contextDir, { recursive: true });

  const agent = await createAgent({
    contextDir,
    sources: [source],
    defaultSource: source.id,
    systemPrompt: "You are a helpful assistant. Keep replies concise.",
    tools: [],
  });

  try {
    const { reply } = await agent.send(prompt);
    stdout(reply + "\n");
    return 0;
  } finally {
    await agent.close();
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
