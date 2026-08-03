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

type Provider = {
  provider: string;
  keyNames: readonly string[];
  baseURLName: string;
  baseURL: string;
  modelName: string;
  model: string;
};

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
} as const satisfies Record<string, Provider>;

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
