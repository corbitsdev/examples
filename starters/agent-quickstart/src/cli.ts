// agent-quickstart: the smallest possible @intx/agent program.
//
// Describe an agent, stand up the host pieces it needs, send one
// prompt, print the reply, close. Nothing else.
//
// This targets the published @intx/agent 0.2.2 API, which splits an
// agent into two halves:
//
//   defineAgent(...)        the portable description — id, system
//                           prompt, tools, inference preferences
//   createAgent(def, env)   the host binding — credentials, storage,
//                           audit sink, authorization, directors
//
// Everything under "the host bootstrap" below is that second half.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type AuthorizeFn,
} from "@intx/agent";
import { createIsogitStore } from "@intx/storage-isogit";

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
  const stdout =
    opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr =
    opts.stderr ?? ((text: string) => void process.stderr.write(text));

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

  // The definition: portable, credential-free, hashable.
  const definition = defineAgent({
    id: EXAMPLE_NAME,
    systemPrompt: "You are a helpful assistant. Keep replies concise.",
    tools: [],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });

  // The host bootstrap. One isogit repository backs both the
  // conversation context and the audit log — createIsogitStore returns
  // an object implementing ContextStore and AuditStore — and `workdir`
  // must be that same directory, since it is the agent's lock boundary.
  const workdir =
    opts.contextDir ?? join(process.cwd(), "tmp", EXAMPLE_NAME, "context");
  mkdirSync(workdir, { recursive: true });
  const storage = await createIsogitStore(workdir);

  const agent = await createAgent(definition, {
    sources: [source],
    defaultSource: source.id,
    storage,
    workdir,
    audit: storage,
    authorize: denyEverything,
    directors: createDefaultDirectorRegistry(),
  });

  try {
    const { reply } = await agent.send(prompt);
    stdout(reply + "\n");
    return 0;
  } finally {
    await agent.close();
  }
}

// This agent has no tools, so nothing ever consults `authorize`. Denying
// by default keeps it that way: adding a tool without also deciding a
// policy fails closed rather than silently granting.
const denyEverything: AuthorizeFn = async () => ({
  effect: "deny",
  matchingGrants: [],
  resolvedBy: null,
});

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
