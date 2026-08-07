import { describe, expect, test } from "bun:test";

import { defineInternalProcessing } from "./workflow";

describe("defineInternalProcessing", () => {
  test("extract merges trigger transcript over summarize output", () => {
    const workflow = defineInternalProcessing({
      id: "test",
      provider: "openai-compatible",
      baseURL: "https://example.com/v1",
      apiKey: "test",
      model: "test",
    });

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
});
