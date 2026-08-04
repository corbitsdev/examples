// Provider resolution keeps the workflow independent from any inference vendor.
//
// Set INTX_PROVIDER to select Anthropic, OpenAI, an OpenAI-compatible endpoint,
// or Google explicitly. Otherwise the first configured API key wins in this
// order: Anthropic, OpenAI, then Google.
//
// INTX_MODEL overrides the selected provider's model. Each provider also
// accepts its own *_MODEL and *_BASE_URL variables. OPENAI_BASE_URL selects the
// OpenAI-compatible adapter for gateways and local inference servers.

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
  /** Canonical provider id passed to Interchange. */
  provider: string;
  /** API-key variables, checked in order. */
  keyNames: readonly string[];
  /** Endpoint override variable and hosted default. */
  baseURLName: string;
  baseURL: string;
  /** Model override variable and default. */
  modelName: string;
  model: string;
};

// OpenAI-compatible is derived from OpenAI when OPENAI_BASE_URL is set.
const providers = {
  anthropic: {
    provider: "anthropic",
    keyNames: ["ANTHROPIC_API_KEY"],
    baseURLName: "ANTHROPIC_BASE_URL",
    baseURL: "https://api.anthropic.com",
    modelName: "ANTHROPIC_MODEL",
    model: "claude-sonnet-4-6",
  },
  openai: {
    provider: "openai",
    keyNames: ["OPENAI_API_KEY"],
    baseURLName: "OPENAI_BASE_URL",
    baseURL: "https://api.openai.com/v1",
    modelName: "OPENAI_MODEL",
    model: "gpt-4o-mini",
  },
  google: {
    provider: "google-genai",
    keyNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    baseURLName: "GOOGLE_BASE_URL",
    baseURL: "https://generativelanguage.googleapis.com",
    modelName: "GOOGLE_MODEL",
    model: "gemini-2.0-flash",
  },
} as const satisfies Record<string, ProviderSpec>;

export function resolveSource(env: NodeJS.ProcessEnv): ResolveResult {
  const requested = env.INTX_PROVIDER?.trim().toLowerCase();
  if (requested) {
    const alias = requested === "openai-compatible" ? "openai" : requested;
    if (alias !== "anthropic" && alias !== "openai" && alias !== "google") {
      return {
        error:
          `INTX_PROVIDER="${requested}" is not recognized. Use ` +
          "anthropic, openai, openai-compatible, or google.\n",
      };
    }
    if (requested === "openai-compatible" && !env.OPENAI_BASE_URL) {
      return {
        error: 'INTX_PROVIDER="openai-compatible" requires OPENAI_BASE_URL.\n',
      };
    }
    const keyName = providers[alias].keyNames.find((name) => env[name]);
    const apiKey = keyName ? env[keyName] : undefined;
    if (!apiKey) {
      return {
        error: `${providers[alias].keyNames.join(" or ")} is not set.\n`,
      };
    }
    return { source: buildSource(env, alias, apiKey) };
  }

  for (const alias of ["anthropic", "openai", "google"] as const) {
    const keyName = providers[alias].keyNames.find((name) => env[name]);
    const apiKey = keyName ? env[keyName] : undefined;
    if (apiKey) return { source: buildSource(env, alias, apiKey) };
  }
  return {
    error:
      "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or GEMINI_API_KEY.\n",
  };
}

function buildSource(
  env: NodeJS.ProcessEnv,
  alias: keyof typeof providers,
  apiKey: string,
): Source {
  const provider = providers[alias];
  const baseURL = env[provider.baseURLName] ?? provider.baseURL;
  const model = env.INTX_MODEL ?? env[provider.modelName] ?? provider.model;
  const providerName =
    alias === "openai" && env.OPENAI_BASE_URL
      ? "openai-compatible"
      : provider.provider;
  return {
    id: `${providerName}:${model}`,
    provider: providerName,
    baseURL,
    apiKey,
    model,
  };
}
