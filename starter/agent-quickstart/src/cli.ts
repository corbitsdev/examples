// agent-quickstart: the smallest possible @intx/agent program.
//
// Define an inference source, build the environment the agent runs in,
// send one prompt, print the reply, close. Nothing else.
//
// This targets @intx/agent 0.2.x, where `createAgent` takes two
// arguments: an AgentDefinition (what the agent *is*) and a BaseEnv
// (what it runs against — sources, storage, audit, authorization). The
// split is the whole point of the 0.2 shape: the definition is portable
// data, the env is host-supplied wiring.
//
// Which model it talks to comes entirely from the environment — see
// ./source.ts. This file never names a vendor.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore, permissiveAuthorize } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";

import { resolveSource } from "@corbits/example-kit/inference";

const EXAMPLE_NAME = "agent-quickstart";

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

  // Endpoint, model and credential all come from the environment. If
  // nothing is configured this fails here with a message naming what to
  // export, rather than guessing and timing out against a wrong host.
  const resolved = resolveSource(env);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }
  const source = resolved.source;

  // What the agent *is*: an id, a system prompt, no tools, and the
  // (provider, model) pairs it is allowed to route to. Pure data — no
  // credentials, no file handles.
  const definition = defineAgent({
    id: EXAMPLE_NAME,
    systemPrompt: "You are a helpful assistant. Keep replies concise.",
    tools: [],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });

  // What it runs against. `storage` is the isogit-backed context store;
  // `audit` and `authorize` are the two seams a real host fills in with
  // a durable audit log and a policy engine. This example uses the
  // testing no-ops so the file you read is the agent, not the host.
  const workdir =
    opts.contextDir ?? join(process.cwd(), "tmp", EXAMPLE_NAME, "context");
  mkdirSync(workdir, { recursive: true });
  const storage = await createIsogitStore(workdir);

  const baseEnv: BaseEnv = {
    sources: [source],
    defaultSource: source.id,
    storage,
    workdir,
    audit: noopAuditStore(),
    authorize: permissiveAuthorize(),
    directors: createDefaultDirectorRegistry(),
  };

  stderr(`agent ${EXAMPLE_NAME} · ${source.provider}/${source.model}\n`);

  const agent = await createAgent(definition, baseEnv);
  try {
    const { reply } = await agent.send(prompt);
    stdout(reply + "\n");
    return 0;
  } finally {
    // Releases the per-directory lock. Skipping this leaves the next
    // run blocked on a stale lock file.
    await agent.close();
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
