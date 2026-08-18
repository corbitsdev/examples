import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";
import {
  action,
  awaitSignal,
  defineWorkflow,
  step,
  type StepInvoker,
  type WorkflowAuthorizeFn,
  type WorkflowDefinition,
} from "@intx/workflow";

import type { Source } from "./source";

export const kind = "slack-post-to-x";
export const label = "Post to X";
export const description =
  "Draft, validate, approve, and publish an X post from Slack.";
export const WORKFLOW_ID = kind;
export const APPROVAL_SIGNAL = "approve";
export const VALIDATE_POST_ACTION = "post-to-x.validate-post";
export const PUBLISH_POST_ACTION = "post-to-x.publish-post";
export const PUBLISH_POST_EFFECT = "x:post";

export function definePostWorkflow(source: Source): WorkflowDefinition {
  const drafter = defineAgent({
    id: "post-drafter",
    systemPrompt:
      "Write one concise X post. Return only the post text; do not publish it.",
    tools: [],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });

  return defineWorkflow({
    id: WORKFLOW_ID,
    trigger: { type: "manual" },
    steps: {
      draft: step({
        agent: drafter,
        input: { from: "trigger.payload" },
        timeout: 120_000,
      }),
      policy: action({
        handler: VALIDATE_POST_ACTION,
        after: ["draft"],
        input: { from: "steps.draft.output" },
        timeout: 1_000,
      }),
      approval: awaitSignal({
        name: APPROVAL_SIGNAL,
        after: ["policy"],
      }),
      publish: action({
        handler: PUBLISH_POST_ACTION,
        after: ["approval"],
        input: { from: "steps.policy.output" },
        effect: { requires: [PUBLISH_POST_EFFECT] },
        timeout: 30_000,
      }),
    },
  });
}

export function createDraftStepInvoker(opts: {
  source: Source;
  contextRoot: string;
  authorize: WorkflowAuthorizeFn;
  log?: (line: string) => void;
}): StepInvoker {
  return async ({ agent, input, authzContext, signal }) => {
    if (authzContext.stepId !== "draft") {
      throw new Error(
        `unsupported agent step: ${authzContext.stepId ?? agent.id}`,
      );
    }
    if (typeof input !== "string" || input.trim() === "") {
      throw new Error("post-to-X trigger must contain a prompt");
    }

    const workdir = join(opts.contextRoot, "draft");
    mkdirSync(workdir, { recursive: true });
    const storage = await createIsogitStore(workdir);
    const env: BaseEnv = {
      sources: [opts.source],
      defaultSource: opts.source.id,
      storage,
      workdir,
      audit: noopAuditStore(),
      authorize: (resource, action) =>
        opts.authorize(resource, action, authzContext),
      directors: createDefaultDirectorRegistry(),
    };
    const runtimeAgent = await createAgent(agent, env);
    opts.log?.("step draft: post-drafter running");
    try {
      const { reply } = await runtimeAgent.send(input, { signal });
      opts.log?.(`step draft: done (${String(reply.length)} chars)`);
      return { output: reply };
    } finally {
      await runtimeAgent.close();
    }
  };
}
