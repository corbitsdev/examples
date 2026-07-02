import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  type AgentDefinition,
  type BaseEnv,
} from "@intx/agent";
import { createIsogitStore } from "@intx/storage-isogit";

import type { Source } from "./source";

export type AgentTurnRuntime = {
  contextRoot: string;
  source: Source;
  authorize: BaseEnv["authorize"];
};

export async function runAgentTurn(
  runtime: AgentTurnRuntime,
  definition: AgentDefinition,
  prompt: string,
  conversationKey: string,
): Promise<string> {
  const contextDir = agentContextDir(runtime.contextRoot, conversationKey);
  mkdirSync(contextDir, { recursive: true });

  const storage = await createIsogitStore(contextDir);
  const agent = await createAgent(definition, {
    sources: [runtime.source],
    defaultSource: runtime.source.id,
    storage,
    workdir: contextDir,
    audit: storage,
    authorize: runtime.authorize,
    directors: createDefaultDirectorRegistry(),
  } satisfies BaseEnv);

  try {
    const { reply } = await agent.send(prompt);
    return reply;
  } finally {
    await agent.close();
  }
}

export function agentContextDir(
  contextRoot: string,
  conversationKey: string,
): string {
  return join(contextRoot, safePathSegment(conversationKey));
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
}
