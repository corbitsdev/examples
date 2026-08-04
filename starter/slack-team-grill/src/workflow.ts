import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type AgentDefinition,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";
import {
  awaitSignal,
  defineWorkflow,
  gate,
  step,
  type AuthorizeContext,
  type StepInvoker,
  type WorkflowAuthorizeFn,
  type WorkflowDefinition,
} from "@intx/workflow";

import type { Source } from "./source";
import { createReportTools, createTurnTools } from "./tools";
import type { GrillReport, GrillTurn } from "./types";

export const WORKFLOW_ID = "slack-team-grill-round";
export const QUESTION_AGENT_ID = "team-grill-questioner";
export const REPORT_AGENT_ID = "team-grill-reporter";
export const DECISION_SIGNAL = "team-grill-decision";

const GRILLING_PROMPT = [
  "You facilitate a team grilling session in Slack.",
  "",
  "Interview the team relentlessly about every aspect of the request until the finalized decisions form a shared understanding.",
  "Walk down each branch of the decision tree, resolving dependencies between decisions one by one.",
  "For every question, provide your recommended answer.",
  "",
  "Ask only one question at a time and wait for the team's finalized choice before continuing.",
  "Each question must offer exactly three concrete, mutually distinct solution options.",
  "Keep the context and each option explanation compact. Call the presentation tool as soon as the decision is clear.",
  "Asking multiple questions at once is bewildering.",
  "",
  "If a fact is already present in the request or finalized decisions, use it rather than asking.",
  "Decisions belong to the team: put every unresolved decision to them.",
  "When the request explicitly names multiple decisions, finalize each named decision in its own question before completing.",
  "Do not repeat or reopen a finalized decision.",
  "Do not stop because a certain number of questions has been asked.",
  "Match the depth of the grilling to the altitude of the original request.",
  "Ask only about decisions needed to resolve the original request itself.",
  "Complete once those requested decisions make the request coherent and actionable.",
  "Do not expand the scope by inventing downstream decisions.",
  "Execution mechanics, staffing, timing, fallback plans, and optional refinements are downstream unless the original request explicitly includes them.",
  "",
  "Given the original request and finalized decisions:",
  "- Call grill_present_question exactly once when any decision branch remains unresolved.",
  "- Call grill_present_complete exactly once only when shared understanding has genuinely been reached.",
  "Never call both tools.",
  "Do not take external action.",
].join("\n");

const REPORT_PROMPT = [
  "Close a completed team grilling session from its original request and finalized decisions.",
  "Write one concise conclusion connecting the choices into a coherent direction.",
  "List only genuinely unresolved facts; use an empty list when nothing remains.",
  "Treat every supplied decision as final.",
  "Do not invent rationale, votes, participants, or next actions.",
  "Call grill_present_report exactly once.",
].join("\n");

export function defineTeamGrillRoundWorkflow(
  source: Source,
): WorkflowDefinition {
  const questioner = defineAgent({
    id: QUESTION_AGENT_ID,
    systemPrompt: GRILLING_PROMPT,
    tools: [createTurnTools()],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });
  const reporter = defineAgent({
    id: REPORT_AGENT_ID,
    systemPrompt: REPORT_PROMPT,
    tools: [createReportTools()],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });

  return defineWorkflow({
    id: WORKFLOW_ID,
    trigger: { type: "manual" },
    steps: {
      generate: step({
        agent: questioner,
        input: { from: "trigger.payload" },
      }),
      route: gate({
        when: { from: "steps.generate.output.needsQuestion" },
        then: "decision",
        else: "report",
        after: ["generate"],
      }),
      decision: awaitSignal({
        name: DECISION_SIGNAL,
        after: ["route"],
      }),
      report: step({
        agent: reporter,
        after: ["route"],
        input: { from: "trigger.payload" },
      }),
    },
  });
}

type AgentEnv = BaseEnv & Record<string, unknown>;
export function createInvokeStep(options: {
  source: Source;
  contextRoot: string;
  authorize: WorkflowAuthorizeFn;
  log: (line: string) => void;
  onStepDone: (stepId: string, output: GrillTurn | GrillReport) => void;
}): StepInvoker {
  return async ({ agent, input, authzContext, signal }) => {
    const stepId = authzContext.stepId ?? agent.id;
    assertAgent(stepId, agent.id);
    const workdir = createWorkdir(options.contextRoot, authzContext, stepId);
    const storage = await createIsogitStore(workdir);
    let output: GrillTurn | GrillReport | undefined;
    let presentationCount = 0;
    let resolvePresentation: (() => void) | undefined;
    const presentation = new Promise<void>((resolve) => {
      resolvePresentation = resolve;
    });
    const sink = (value: GrillTurn | GrillReport) => {
      presentationCount += 1;
      if (presentationCount > 1) {
        throw new Error("Presentation tool may be called only once");
      }
      output = value;
      resolvePresentation?.();
    };
    const round = readRound(input);
    const env: AgentEnv = {
      sources: [options.source],
      defaultSource: options.source.id,
      storage,
      workdir,
      audit: noopAuditStore(),
      directors: createDefaultDirectorRegistry(),
      authorize: (resource: string, action: string) =>
        options.authorize(resource, action, { ...authzContext, stepId }),
      sink,
      ...(stepId === "generate" ? { round } : {}),
    };

    options.log(`step ${stepId}: ${agent.id} running`);
    const controller = new AbortController();
    const abortFromWorkflow = () => controller.abort(signal.reason);
    if (signal.aborted) abortFromWorkflow();
    else signal.addEventListener("abort", abortFromWorkflow, { once: true });
    const agentRun = runRuntimeAgent(
      agent,
      env,
      JSON.stringify(input),
      controller.signal,
    );
    const outcome = await Promise.race([
      agentRun.then((result) => ({ kind: "reply" as const, result })),
      presentation.then(() => ({ kind: "presented" as const })),
    ]);
    signal.removeEventListener("abort", abortFromWorkflow);
    if (outcome.kind === "presented") {
      controller.abort("Presentation captured");
      await agentRun.catch(() => undefined);
    } else {
      const failure = inferenceFailureMessage(outcome.result.reply);
      if (failure !== undefined) throw new Error(failure);
    }
    if (presentationCount !== 1 || output === undefined) {
      throw new Error(`${agent.id} must call one presentation tool exactly once`);
    }
    options.log(`step ${stepId}: done`);
    options.onStepDone(stepId, output);
    return { output };
  };
}

export function createLocalWorkflowAuthorize(): WorkflowAuthorizeFn {
  return async (resource, action, context) => {
    const effect =
      action === "invoke" &&
      resource.startsWith("tool:") &&
      context.stepId !== undefined
        ? "allow"
        : "deny";
    const grant = {
      id: `${context.stepId ?? "workflow"}-${effect}`,
      resource,
      action: "invoke",
      effect: effect as "allow" | "deny",
      origin: effect === "allow" ? ("invoker" as const) : ("system" as const),
      specificity: effect === "allow" ? 100 : 0,
    };
    return { effect, matchingGrants: [grant], resolvedBy: grant };
  };
}

function inferenceFailureMessage(reply: string): string | undefined {
  const normalized = reply.trim();
  return normalized.startsWith("This agent could not complete your request") ||
    normalized.startsWith(
      "This agent encountered a temporary error communicating with the inference provider",
    ) ||
    normalized.startsWith("This agent's inference request was aborted")
    ? normalized
    : undefined;
}

async function runRuntimeAgent(
  definition: AgentDefinition,
  env: AgentEnv,
  prompt: string,
  signal: AbortSignal,
): Promise<{ reply: string }> {
  const agent = await createAgent(definition, env);
  try {
    return await agent.send(prompt, { signal });
  } finally {
    await agent.close();
  }
}

function readRound(input: unknown): number {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !("round" in input) ||
    typeof input.round !== "number" ||
    !Number.isInteger(input.round) ||
    input.round < 1
  ) {
    throw new Error("Grill round must be a positive integer");
  }
  return input.round;
}

function assertAgent(stepId: string, agentId: string): void {
  const expected =
    stepId === "generate"
      ? QUESTION_AGENT_ID
      : stepId === "report"
        ? REPORT_AGENT_ID
        : undefined;
  if (expected === undefined) throw new Error(`Unknown agent step ${stepId}`);
  if (agentId !== expected) {
    throw new Error(`Workflow step ${stepId} cannot invoke agent ${agentId}`);
  }
}

function createWorkdir(
  root: string,
  context: AuthorizeContext,
  stepId: string,
): string {
  const path = join(
    root,
    safePathSegment(context.runId ?? "local-run"),
    safePathSegment(stepId),
    String(context.attempt ?? 1),
  );
  mkdirSync(path, { recursive: true });
  return path;
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
}
