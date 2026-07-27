import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  type Agent,
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

const agents = new Map<string, Promise<Agent>>();

export async function runAgentTurn(
  runtime: AgentTurnRuntime,
  definition: AgentDefinition,
  prompt: string,
  conversationKey: string,
): Promise<string> {
  const contextDir = agentContextDir(runtime.contextRoot, conversationKey);
  let agentPromise = agents.get(contextDir);

  if (agentPromise === undefined) {
    mkdirSync(contextDir, { recursive: true });
    agentPromise = createIsogitStore(contextDir).then((storage) =>
      createAgent(definition, {
        sources: [runtime.source],
        defaultSource: runtime.source.id,
        storage,
        workdir: contextDir,
        audit: storage,
        authorize: runtime.authorize,
        directors: createDefaultDirectorRegistry(),
      } satisfies BaseEnv),
    );
    agents.set(contextDir, agentPromise);
  }

  const agent = await agentPromise;
  const { reply } = await agent.send(prompt);
  return reply;
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
