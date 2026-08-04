import { describe, expect, test } from "bun:test";
import { runLocal, type StepInvoker } from "@intx/workflow";

import type { GrillDecision, GrillQuestion } from "./types";
import {
  DECISION_SIGNAL,
  defineTeamGrillRoundWorkflow,
} from "./workflow";

const source = {
  id: "test",
  provider: "openai-compatible",
  baseURL: "https://example.com/v1",
  apiKey: "test",
  model: "test-model",
};

const question: GrillQuestion = {
  needsQuestion: true,
  round: 7,
  question: "Which customer should this launch win first?",
  context: "Choose the segment that sharpens the rest of the plan.",
  options: [
    { id: "a", title: "Developer teams", detail: "Lead with technical depth." },
    { id: "b", title: "Marketing teams", detail: "Lead with campaign speed." },
    { id: "c", title: "Founders", detail: "Lead with leverage." },
  ],
  recommendedOptionId: "a",
};

describe("team grill workflow", () => {
  test("does not complete an unresolved round until it receives the decision signal", async () => {
    const invokeStep: StepInvoker = async ({ authzContext }) => {
      if (authzContext.stepId !== "generate") {
        throw new Error("report should be skipped");
      }
      return { output: question };
    };
    const run = runLocal(defineTeamGrillRoundWorkflow(source), {
      triggerPayload: { request: "Grill us", decisions: [], round: 7 },
      invokeStep,
    });

    const beforeSignal = await Promise.race([
      run.complete.then(() => "completed" as const),
      Bun.sleep(10).then(() => "pending" as const),
    ]);
    expect(beforeSignal).toBe("pending");

    await run.signal(DECISION_SIGNAL, { decisions: [decision(7)] });
    const result = await run.complete;
    expect(result.terminalStatus).toBe("completed");
    expect(result.outputs.decision).toEqual({ decisions: [decision(7)] });
    expect(result.outputs.report).toBeUndefined();
  });

  test("routes shared understanding directly to the final reporter", async () => {
    const invoked: string[] = [];
    const invokeStep: StepInvoker = async ({ authzContext }) => {
      const stepId = authzContext.stepId ?? "";
      invoked.push(stepId);
      return stepId === "generate"
        ? { output: { needsQuestion: false } }
        : {
            output: {
              conclusion: "The decisions form a coherent direction.",
              openItems: [],
            },
          };
    };
    const run = runLocal(defineTeamGrillRoundWorkflow(source), {
      triggerPayload: {
        request: "Grill us",
        decisions: [decision(1), decision(2), decision(3), decision(4)],
        round: 5,
      },
      invokeStep,
    });
    const result = await run.complete;
    expect(result.terminalStatus).toBe("completed");
    expect(invoked).toEqual(["generate", "report"]);
    expect(result.outputs.decision).toBeUndefined();
    expect(result.outputs.report).toEqual({
      conclusion: "The decisions form a coherent direction.",
      openItems: [],
    });
  });
});

function decision(round: number): GrillDecision {
  return {
    round,
    question: `Question ${String(round)}`,
    selectedOptionId: "a",
    selectedOptionTitle: "Developer teams",
    finalizedBy: "U123",
  };
}
