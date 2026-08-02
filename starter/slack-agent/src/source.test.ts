import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { resolveSource, type Source } from "./source";

function source(env: NodeJS.ProcessEnv): Source {
  const result = resolveSource(env);
  if (result.source === undefined) throw new Error(result.error);
  return result.source;
}

function exampleEnv(): NodeJS.ProcessEnv {
  const text = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  return Object.fromEntries(
    text.split("\n").flatMap((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return [];

      const separator = line.indexOf("=");
      if (separator === -1) return [];

      return [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]];
    }),
  );
}

describe("resolveSource", () => {
  test("the sample environment does not preselect Anthropic", () => {
    expect(
      source({ ...exampleEnv(), OPENAI_API_KEY: "openai-key" }).provider,
    ).toBe("openai");
  });

  test("auto-detects each supported provider", () => {
    expect(source({ ANTHROPIC_API_KEY: "anthropic-key" }).provider).toBe(
      "anthropic",
    );
    expect(source({ OPENAI_API_KEY: "openai-key" }).provider).toBe("openai");
    expect(source({ GOOGLE_API_KEY: "google-key" }).provider).toBe(
      "google-genai",
    );
  });

  test("explicit provider selection wins over auto-detection", () => {
    expect(
      source({
        INTX_PROVIDER: "google",
        ANTHROPIC_API_KEY: "anthropic-key",
        GOOGLE_API_KEY: "google-key",
      }).provider,
    ).toBe("google-genai");
  });

  test("configures an OpenAI-compatible endpoint", () => {
    expect(
      source({
        INTX_PROVIDER: "openai-compatible",
        INTX_MODEL: " custom-model ",
        OPENAI_API_KEY: "openai-key",
        OPENAI_BASE_URL: " https://models.example/v1 ",
      }),
    ).toMatchObject({
      provider: "openai-compatible",
      baseURL: "https://models.example/v1",
      model: "custom-model",
    });
  });

  test("ignores blank credentials and reports missing configuration", () => {
    expect(
      source({ ANTHROPIC_API_KEY: "  ", GEMINI_API_KEY: "gemini-key" })
        .provider,
    ).toBe("google-genai");

    expect(
      resolveSource({
        ANTHROPIC_API_KEY: " ",
        OPENAI_API_KEY: " ",
        GOOGLE_API_KEY: " ",
      }).error,
    ).toContain("No provider API key found");
  });
});
