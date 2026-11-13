import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  type Agent,
  type AgentDefinition,
  type BaseEnv,
} from "@intx/agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { createIsogitStorage } from "@intx/storage-isogit";

// Bind storage to the host filesystem explicitly in Interchange 0.5.
const { createIsogitStore } = createIsogitStorage({
  fs,
  path,
  rename: fs.promises.rename,
});

// Keep secret material out of the inference source passed to the agent.
function inferenceEnv(source: {
  id: string;
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
}) {
  const { apiKey, ...config } = source;
  return {
    sources: [{ ...config, credentialId: source.id }],
    readCurrentMaterial: (credentialId: string) => {
      if (credentialId !== source.id)
        throw new Error(`Unknown credential: ${credentialId}`);
      return { secret: apiKey };
    },
  };
}


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
        ...inferenceEnv(runtime.source),
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
  const result = await agent.send(prompt);
  if (result.type !== "reply")
    throw new Error(`Agent suspended: ${result.correlationId}`);
  const { reply } = result;
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
