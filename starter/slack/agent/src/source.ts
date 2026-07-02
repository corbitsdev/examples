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
  provider: string;
  keyVars: readonly string[];
  baseURLVar: string;
  baseURL: string;
  modelVar: string;
  model: string;
};

const PROVIDERS = {
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
} as const satisfies Record<string, ProviderSpec>;

type ProviderAlias = keyof typeof PROVIDERS;

const DETECTION_ORDER = ["anthropic", "openai", "google"] as const;

export function resolveSource(env: NodeJS.ProcessEnv): ResolveResult {
  const requested = env.INTX_PROVIDER?.trim().toLowerCase();

  if (requested !== undefined && requested !== "") {
    const alias = requested === "openai-compatible" ? "openai" : requested;
    if (!isProviderAlias(alias)) {
      return {
        error:
          `INTX_PROVIDER="${requested}" is not recognized. Use one of: ` +
          "anthropic, openai, openai-compatible, google.\n",
      };
    }

    const apiKey = firstEnv(env, PROVIDERS[alias].keyVars);
    if (apiKey === undefined) {
      return {
        error:
          `INTX_PROVIDER="${requested}" but ` +
          `${PROVIDERS[alias].keyVars.join(" / ")} is not set.\n`,
      };
    }
    if (
      requested === "openai-compatible" &&
      (env.OPENAI_BASE_URL === undefined || env.OPENAI_BASE_URL === "")
    ) {
      return {
        error: 'INTX_PROVIDER="openai-compatible" requires OPENAI_BASE_URL.\n',
      };
    }
    return { source: buildSource(env, alias, apiKey) };
  }

  for (const alias of DETECTION_ORDER) {
    const apiKey = firstEnv(env, PROVIDERS[alias].keyVars);
    if (apiKey !== undefined) return { source: buildSource(env, alias, apiKey) };
  }

  return {
    error:
      "No provider API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.\n",
  };
}

function buildSource(
  env: NodeJS.ProcessEnv,
  alias: ProviderAlias,
  apiKey: string,
): Source {
  const spec = PROVIDERS[alias];
  const model = env.INTX_MODEL ?? env[spec.modelVar] ?? spec.model;
  const customBaseURL = env[spec.baseURLVar];
  const provider =
    alias === "openai" && customBaseURL !== undefined && customBaseURL !== ""
      ? "openai-compatible"
      : spec.provider;
  const baseURL = customBaseURL ?? spec.baseURL;

  return { id: `${provider}:${model}`, provider, baseURL, apiKey, model };
}

function isProviderAlias(value: string): value is ProviderAlias {
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
