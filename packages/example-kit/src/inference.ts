// Inference configuration — read from the environment, never guessed.
//
// Interchange's inference layer takes a source: `{ id, provider, baseURL,
// apiKey, model }`. `provider` selects a wire-format adapter — the ones
// @intx/inference ships are `anthropic`, `openai`, `openai-compatible`
// and `google-genai` — and the other three fields are pure configuration.
//
// So this file names no vendor and hardcodes no endpoint of its own. It
// reads the endpoint, the model and the credential out of the process
// environment and hands them straight through. Ollama on a laptop, a
// hosted vendor, vLLM in a cluster and an OpenAI-compatible gateway are
// all the same code path, distinguished only by the values you export.
//
// Two ways to configure it:
//
//   1. Explicit — works for every endpoint, including local servers:
//        INTX_BASE_URL   endpoint root
//        INTX_MODEL      model id served there
//        INTX_API_KEY    credential
//        INTX_PROVIDER   wire protocol; optional, defaults to
//                        `openai-compatible`, which is what most
//                        endpoints (including OpenAI's own) speak
//
//   2. Conventional vendor key — if you already have one exported:
//        ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY /
//        GEMINI_API_KEY  supply the credential, and imply that vendor's
//        published endpoint and adapter.
//      INTX_MODEL is still required. Model ids move faster than anything
//      else here, so a stale built-in default would be a bug waiting to
//      happen — the model is the one thing this file will never pick
//      for you.
//
// If neither is configured, `resolveSource` returns an error naming
// exactly what to export. There is no fallback: a silent default would
// bake whoever ran it last into a public examples repo.

export type Source = {
  id: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
};

export type ResolveResult =
  | { source: Source; error?: undefined }
  | { source?: undefined; error: string };

/** Wire-format adapters registered by @intx/inference. */
const PROTOCOLS = [
  "anthropic",
  "openai",
  "openai-compatible",
  "google-genai",
] as const;

/**
 * Assumed when INTX_BASE_URL is set without INTX_PROVIDER. This is a
 * protocol default, not a vendor one: the endpoint is always explicit,
 * and this only says which wire format to speak to it.
 */
const DEFAULT_PROTOCOL = "openai-compatible";

/**
 * Conventional vendor keys, in the order they are checked. Each supplies
 * a credential and implies that vendor's published API root and adapter.
 * These are facts about the vendors, not about any machine.
 */
const VENDORS = [
  {
    keyVar: "ANTHROPIC_API_KEY",
    provider: "anthropic",
    baseURL: "https://api.anthropic.com",
  },
  {
    keyVar: "OPENAI_API_KEY",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
  },
  {
    keyVar: "GOOGLE_API_KEY",
    provider: "google-genai",
    baseURL: "https://generativelanguage.googleapis.com",
  },
  {
    keyVar: "GEMINI_API_KEY",
    provider: "google-genai",
    baseURL: "https://generativelanguage.googleapis.com",
  },
] as const;

const UNCONFIGURED =
  "No inference provider is configured.\n" +
  "\n" +
  "Point these examples at whichever endpoint you want them to use:\n" +
  "\n" +
  "  export INTX_BASE_URL=...   # endpoint root\n" +
  "  export INTX_MODEL=...      # a model served at that endpoint\n" +
  "  export INTX_API_KEY=...    # credential (any non-empty value for a\n" +
  "                             # local server that does not check one)\n" +
  "\n" +
  `  export INTX_PROVIDER=...   # optional wire protocol: ${PROTOCOLS.join(", ")}\n` +
  `                             # defaults to ${DEFAULT_PROTOCOL}\n` +
  "\n" +
  "Or export a vendor key — " +
  VENDORS.map((v) => v.keyVar).join(", ") +
  " —\n" +
  "together with INTX_MODEL, and the endpoint and protocol are implied.\n" +
  "\n" +
  "See .env.example at the repo root for ready-made blocks.\n";

const NEEDS_MODEL =
  "INTX_MODEL is not set. Name the model to run against:\n" +
  "  export INTX_MODEL=...\n";

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function isProtocol(value: string): boolean {
  return (PROTOCOLS as readonly string[]).includes(value);
}

function build(
  provider: string,
  baseURL: string,
  apiKey: string,
  model: string,
): Source {
  return { id: `${provider}:${model}`, provider, baseURL, apiKey, model };
}

/**
 * Resolve an inference `Source` from `env`, or return a human-readable
 * `error` naming exactly what to export. Callers print the error and
 * exit non-zero. Never falls back to a default endpoint or model.
 */
export function resolveSource(env: NodeJS.ProcessEnv): ResolveResult {
  const model = readEnv(env, "INTX_MODEL");
  const baseURL = readEnv(env, "INTX_BASE_URL");
  const apiKey = readEnv(env, "INTX_API_KEY");
  const provider = readEnv(env, "INTX_PROVIDER");

  if (baseURL !== undefined) {
    if (model === undefined) return { error: NEEDS_MODEL };
    if (apiKey === undefined) {
      return {
        error:
          "INTX_BASE_URL is set but INTX_API_KEY is not. Every source carries\n" +
          "a credential; endpoints that ignore it still need a placeholder:\n" +
          "  export INTX_API_KEY=local\n",
      };
    }
    const protocol = provider ?? DEFAULT_PROTOCOL;
    if (!isProtocol(protocol)) {
      return {
        error:
          `INTX_PROVIDER="${protocol}" is not a known wire protocol. Use one of: ` +
          `${PROTOCOLS.join(", ")}.\n`,
      };
    }
    return { source: build(protocol, baseURL, apiKey, model) };
  }

  for (const vendor of VENDORS) {
    const vendorKey = readEnv(env, vendor.keyVar);
    if (vendorKey === undefined) continue;
    if (model === undefined) return { error: NEEDS_MODEL };
    return { source: build(vendor.provider, vendor.baseURL, vendorKey, model) };
  }

  if (provider !== undefined) {
    return {
      error:
        `INTX_PROVIDER="${provider}" is set but there is no endpoint to use it against.\n` +
        "Set INTX_BASE_URL and INTX_API_KEY too.\n",
    };
  }

  return { error: UNCONFIGURED };
}
