// Human-in-the-loop approval workflow.
//
// This is the workflow version of the seeded Interchange `approval-flow`
// fixture: a draft step runs first, the run parks on an `approve`
// signal, and the publish step resumes only after that signal arrives.

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
  awaitSignal,
  defineWorkflow,
  step,
  type StepInvoker,
  type WorkflowAuthorizeFn,
  type WorkflowDefinition,
} from "@intx/workflow";

import type { Source } from "./source";

export const WORKFLOW_ID = "workflow-approval-flow";
export const APPROVAL_SIGNAL = "approve";

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

export function defineApprovalFlow(source: Source): WorkflowDefinition {
  const drafter = agent(
    "draft-agent",
    "You are the drafting step of an approval workflow. Given a request, produce a concise draft that is ready for human review. Output only the draft.",
    source,
  );
  const publisher = agent(
    "publish-agent",
    "You are the publishing step of an approval workflow. The draft has been approved. Finalize it, keep the meaning intact, and report the publish-ready version. Output only the final content.",
    source,
  );

  return defineWorkflow({
    id: WORKFLOW_ID,
    trigger: { type: "manual" },
    steps: {
      draft: step({ agent: drafter, input: { from: "trigger.payload" } }),
      approval: awaitSignal({
        name: APPROVAL_SIGNAL,
        after: ["draft"],
      }),
      publish: step({
        agent: publisher,
        after: ["approval"],
        input: { from: "steps.draft.output" },
      }),
    },
  });
}

export function createInvokeStep(opts: {
  source: Source;
  contextRoot: string;
  authorize: WorkflowAuthorizeFn;
  log?: (line: string) => void;
  onStepDone?: (stepId: string, output: string) => void;
}): StepInvoker {
  const { source, contextRoot, authorize, log, onStepDone } = opts;

  return async ({ agent, input, authzContext }) => {
    const stepId = authzContext.stepId ?? agent.id;
    const decision = await authorize(`workflow-step:${stepId}`, "invoke", {
      ...authzContext,
      stepId,
    });
    log?.(`policy result: ${decision.effect ?? "null"} for ${stepId}`);
    if (decision.effect !== "allow") {
      throw new Error(
        `authorization blocked workflow-step:${stepId} invoke with effect ${decision.effect ?? "null"}`,
      );
    }

    log?.(`step ${stepId}: ${agent.id} running`);

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
      log?.(`step ${stepId}: done (${String(reply.length)} chars)`);
      onStepDone?.(stepId, reply);
      return { output: reply };
    } finally {
      await runtimeAgent.close();
    }
  };
}
