import { describe, expect, test } from "bun:test";
import { runLocal, type StepInvoker } from "@intx/workflow";

import { defineInternalProcessing } from "./workflow";

describe("defineInternalProcessing", () => {
  const source = {
    id: "test",
    provider: "openai-compatible",
    baseURL: "https://example.com/v1",
    apiKey: "test",
    model: "test",
  };

  test("extract merges trigger transcript over summarize output", () => {
    const workflow = defineInternalProcessing(source);

    const extract = workflow.steps.extract;
    const summarize = workflow.steps.summarize;
    expect(extract?.kind).toBe("step");
    expect(summarize?.kind).toBe("step");
    if (extract?.kind !== "step" || summarize?.kind !== "step") return;

    expect(extract.input).toEqual({
      merge: [
        { from: "steps.summarize.output" },
        {
          project: { from: "trigger.payload" },
          fields: ["callTitle", "transcript"],
        },
      ],
    });
    expect(summarize.agent.systemPrompt).toContain(
      "Do not echo the transcript",
    );
  });

  test("completes the object merge with parsed step outputs", async () => {
    const input = {
      callTitle: "Acme call",
      transcript: "Acme discussed runway and a possible expansion.",
    };
    const digest = {
      callTitle: input.callTitle,
      summary: "Discussed runway and expansion.",
      discussionPoints: ["Runway", "Expansion"],
      companies: [],
      claims: [],
    };
    const invokeStep: StepInvoker = async ({ authzContext, input: stepInput }) => {
      if (authzContext.stepId === "summarize") {
        return {
          output: {
            summary: digest.summary,
            discussionPoints: digest.discussionPoints,
          },
        };
      }
      expect(authzContext.stepId).toBe("extract");
      expect(stepInput).toEqual({
        callTitle: input.callTitle,
        transcript: input.transcript,
        summary: digest.summary,
        discussionPoints: digest.discussionPoints,
      });
      return { output: digest };
    };

    const result = await runLocal(defineInternalProcessing(source), {
      triggerPayload: input,
      invokeStep,
    }).complete;

    expect(result.terminalStatus).toBe("completed");
    expect(result.outputs.extract).toEqual(digest);
  });
});
