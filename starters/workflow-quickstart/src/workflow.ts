// The workflow — a two-step draft -> review chain.
//
// This is the heart of the example. `defineDraftReviewWorkflow` builds
// the WorkflowDefinition; `createInvokeStep` is the runner the runtime
// calls once per step. Keeping them here (rather than buried in the CLI)
// makes the workflow the thing you open and read.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type AgentDefinition,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore, permissiveAuthorize } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";
import {
  defineWorkflow,
  step,
  type StepInvoker,
  type WorkflowDefinition,
} from "@intx/workflow";

import type { Source } from "./source";

export const WORKFLOW_ID = "workflow-quickstart";

function agent(
  id: string,
  systemPrompt: string,
  source: Source,
): AgentDefinition {
  return defineAgent({
    id,
    systemPrompt,
    tools: [],
    capabilities: [],
    inference: { sources: [{ provider: source.provider, model: source.model }] },
  });
}

/**
 * Build the workflow: `draft` -> `review`.
 *
 * - `draft` reads the run trigger:           `input: { from: "trigger.payload" }`
 * - `review` reads draft's output and runs   `input: { from: "steps.draft.output" }`
 *   after it:                                 `after: ["draft"]`
 *
 * Those two selectors are the whole multi-step story — data flows
 * trigger -> draft -> review.
 */
export function defineDraftReviewWorkflow(source: Source): WorkflowDefinition {
  const writer = agent(
    "draft",
    "You are a writer. Given a topic, write one tight, vivid paragraph about it. Output only the paragraph.",
    source,
  );
  const editor = agent(
    "review",
    "You are an editor. Given a paragraph, return a single sharper sentence that captures it. Output only the sentence.",
    source,
  );

  return defineWorkflow({
    id: WORKFLOW_ID,
    trigger: { type: "manual" },
    steps: {
      draft: step({ agent: writer, input: { from: "trigger.payload" } }),
      review: step({
        agent: editor,
        input: { from: "steps.draft.output" },
        after: ["draft"],
      }),
    },
  });
}

/**
 * The step runner the runtime calls once per step. It logs the step's
 * start and completion (so a run reads as a workflow, not a black box),
 * instantiates the step's agent against a per-step context dir, and
 * sends the materialized input as the prompt. The returned `output`
 * becomes `steps.<id>.output` for the next step's selector.
 */
export function createInvokeStep(opts: {
  source: Source;
  contextRoot: string;
  log?: (line: string) => void;
}): StepInvoker {
  const { source, contextRoot, log } = opts;

  return async ({ agent, input, authzContext }) => {
    const stepId = authzContext.stepId ?? agent.id;
    log?.(`  → step ${stepId} (agent ${agent.id}) running…`);

    // One context dir (isogit store + lock) per step, keyed on stepId so
    // steps never contend for a lock — even if they reuse an agent id.
    const workdir = join(contextRoot, stepId);
    mkdirSync(workdir, { recursive: true });
    const storage = await createIsogitStore(workdir);

    const env: BaseEnv = {
      sources: [source],
      defaultSource: source.id,
      storage,
      workdir,
      audit: noopAuditStore(),
      authorize: permissiveAuthorize(),
      directors: createDefaultDirectorRegistry(),
    };

    const runtimeAgent = await createAgent(agent, env);
    try {
      const prompt = typeof input === "string" ? input : JSON.stringify(input);
      const { reply } = await runtimeAgent.send(prompt);
      log?.(`  ✓ step ${stepId} done (${String(reply.length)} chars)`);
      return { output: reply };
    } finally {
      await runtimeAgent.close();
    }
  };
}
