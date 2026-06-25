// Provider resolution — drop in whichever provider you have a key for.
//
// Interchange's inference layer ships adapters for Anthropic, OpenAI,
// any OpenAI-compatible endpoint, and Google Gemini. A source is just
// `{ id, provider, baseURL, apiKey, model }`; resolving one here keeps
// the workflow in `cli.ts` provider-agnostic — it never names a vendor.
//
// Selection is by environment, in this order:
//
//   1. If `INTX_PROVIDER` is set, it wins (anthropic | openai |
//      openai-compatible | google).
//   2. Otherwise auto-detect: the first provider whose API key is
//      present, checked anthropic -> openai -> google.
//
// Per provider you can override the model (`INTX_MODEL`, or the
// provider-specific `*_MODEL`) and the endpoint (`*_BASE_URL`). Setting
// `OPENAI_BASE_URL` flips the OpenAI provider to `openai-compatible`,
// which is how you point at a local server, OpenRouter, Together, etc.

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

type ProviderSpec = {
  /** Canonical provider id passed to interchange's adapter registry. */
  provider: string;
  /** Env vars holding the API key, tried in order. */
  keyVars: readonly string[];
  /** Env var overriding the endpoint root. */
  baseURLVar: string;
  /** Default endpoint root for the provider's hosted API. */
  baseURL: string;
  /** Env var overriding the model. */
  modelVar: string;
  /** Default model. Override per run with INTX_MODEL or `modelVar`. */
  model: string;
};

// Keyed by the short alias a user types into INTX_PROVIDER / auto-detect
// order. `openai-compatible` is derived from `openai` at resolve time,
// so it is intentionally absent here.
const PROVIDERS: Record<"anthropic" | "openai" | "google", ProviderSpec> = {
  anthropic: {
    provider: "anthropic",
    keyVars: ["ANTHROPIC_API_KEY"],
    baseURLVar: "ANTHROPIC_BASE_URL",
    baseURL: "https://api.anthropic.com",
    modelVar: "ANTHROPIC_MODEL",
    model: "claude-sonnet-4-6",
  },
  openai: {
    provider: "openai",
    keyVars: ["OPENAI_API_KEY"],
    baseURLVar: "OPENAI_BASE_URL",
    baseURL: "https://api.openai.com/v1",
    modelVar: "OPENAI_MODEL",
    model: "gpt-4o-mini",
  },
  google: {
    provider: "google-genai",
    keyVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    baseURLVar: "GOOGLE_BASE_URL",
    baseURL: "https://generativelanguage.googleapis.com",
    modelVar: "GOOGLE_MODEL",
    model: "gemini-2.0-flash",
  },
};

type Alias = keyof typeof PROVIDERS;

const DETECTION_ORDER = ["anthropic", "openai", "google"] as const;

function isAlias(value: string): value is Alias {
  return value === "anthropic" || value === "openai" || value === "google";
}

function firstEnv(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function buildSource(
  env: NodeJS.ProcessEnv,
  alias: keyof typeof PROVIDERS,
  apiKey: string,
): Source {
  const spec = PROVIDERS[alias];
  const model = env.INTX_MODEL ?? env[spec.modelVar] ?? spec.model;

  // A custom OpenAI base URL means a non-OpenAI endpoint that speaks the
  // OpenAI wire format. Surface it as `openai-compatible` (same adapter)
  // so the intent is legible in logs and audits.
  const customBaseURL = env[spec.baseURLVar];
  const provider =
    alias === "openai" && customBaseURL !== undefined && customBaseURL !== ""
      ? "openai-compatible"
      : spec.provider;
  const baseURL = customBaseURL ?? spec.baseURL;

  return { id: `${provider}:${model}`, provider, baseURL, apiKey, model };
}

/**
 * Resolve an inference `Source` from the environment, or return a
 * human-readable `error` explaining what to set. The caller prints the
 * error and exits non-zero — mirroring agent-quickstart's key check,
 * extended across providers.
 */
export function resolveSource(env: NodeJS.ProcessEnv): ResolveResult {
  const requested = env.INTX_PROVIDER?.trim().toLowerCase();

  if (requested !== undefined && requested !== "") {
    // `openai-compatible` is an alias for `openai` with a required
    // custom base URL.
    const alias = requested === "openai-compatible" ? "openai" : requested;
    if (!isAlias(alias)) {
      return {
        error:
          `INTX_PROVIDER="${requested}" is not recognized. Use one of: ` +
          "anthropic, openai, openai-compatible, google.\n",
      };
    }
    const spec = PROVIDERS[alias];
    const apiKey = firstEnv(env, spec.keyVars);
    if (apiKey === undefined) {
      return {
        error:
          `INTX_PROVIDER="${requested}" but ${spec.keyVars.join(" / ")} is not set. ` +
          `Export it and re-run:\n  export ${spec.keyVars[0]}=...\n`,
      };
    }
    if (
      requested === "openai-compatible" &&
      (env.OPENAI_BASE_URL === undefined || env.OPENAI_BASE_URL === "")
    ) {
      return {
        error:
          'INTX_PROVIDER="openai-compatible" requires OPENAI_BASE_URL.\n' +
          "  export OPENAI_BASE_URL=https://your-endpoint/v1\n",
      };
    }
    return { source: buildSource(env, alias, apiKey) };
  }

  // Auto-detect: first provider with a key present.
  for (const alias of DETECTION_ORDER) {
    const apiKey = firstEnv(env, PROVIDERS[alias].keyVars);
    if (apiKey !== undefined) return { source: buildSource(env, alias, apiKey) };
  }

  return {
    error:
      "No provider API key found. Set one of these and re-run:\n" +
      "  export ANTHROPIC_API_KEY=...   # Anthropic (default)\n" +
      "  export OPENAI_API_KEY=...      # OpenAI (set OPENAI_BASE_URL for a compatible endpoint)\n" +
      "  export GOOGLE_API_KEY=...      # Google Gemini (or GEMINI_API_KEY)\n" +
      "Optionally set INTX_PROVIDER and INTX_MODEL to be explicit.\n",
  };
}
