import { defineTool, type BaseEnv } from "@intx/agent";

import { createXTools, type XAuthentication } from "./index";

const OAUTH1_VARIABLES = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
] as const;
const ATOMIC_OAUTH1_VARIABLE = "X_OAUTH1_CREDENTIAL";

function readRequiredVariable(name: (typeof OAUTH1_VARIABLES)[number]): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `@intx/tools-x requires ${OAUTH1_VARIABLES.join(", ")} together for OAuth 1.0a`,
    );
  }
  return value;
}

function readAtomicOAuth1Credential(raw: string): XAuthentication {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "@intx/tools-x requires X_OAUTH1_CREDENTIAL to contain valid JSON",
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "@intx/tools-x requires X_OAUTH1_CREDENTIAL to be a JSON object",
    );
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "accessToken",
    "accessTokenSecret",
    "apiKey",
    "apiSecret",
  ];
  const actualKeys = Object.keys(record).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `@intx/tools-x requires X_OAUTH1_CREDENTIAL to contain exactly ${expectedKeys.join(", ")}`,
    );
  }
  const readField = (key: string): string => {
    const field = record[key];
    if (typeof field !== "string" || field.trim() === "") {
      throw new Error(
        `@intx/tools-x requires X_OAUTH1_CREDENTIAL.${key} to be a non-empty string`,
      );
    }
    return field;
  };
  return {
    type: "oauth1",
    apiKey: readField("apiKey"),
    apiSecret: readField("apiSecret"),
    accessToken: readField("accessToken"),
    accessTokenSecret: readField("accessTokenSecret"),
  };
}

function readXAuthentication(): XAuthentication {
  const atomicOAuth1 = process.env[ATOMIC_OAUTH1_VARIABLE];
  const hasDirectVariable = OAUTH1_VARIABLES.some(
    (name) => process.env[name] !== undefined,
  );
  if (atomicOAuth1 !== undefined) {
    if (hasDirectVariable) {
      throw new Error(
        `@intx/tools-x does not allow ${ATOMIC_OAUTH1_VARIABLE} together with ${OAUTH1_VARIABLES.join(", ")}`,
      );
    }
    return readAtomicOAuth1Credential(atomicOAuth1);
  }

  const accessToken = process.env["X_ACCESS_TOKEN"];
  const oauth1OnlyVariables = [
    process.env["X_API_KEY"],
    process.env["X_API_SECRET"],
    process.env["X_ACCESS_TOKEN_SECRET"],
  ];
  if (oauth1OnlyVariables.some((value) => value !== undefined && value !== "")) {
    return {
      type: "oauth1",
      apiKey: readRequiredVariable("X_API_KEY"),
      apiSecret: readRequiredVariable("X_API_SECRET"),
      accessToken: readRequiredVariable("X_ACCESS_TOKEN"),
      accessTokenSecret: readRequiredVariable("X_ACCESS_TOKEN_SECRET"),
    };
  }
  if (accessToken === undefined || accessToken.trim() === "") {
    throw new Error(
      "@intx/tools-x requires an X_ACCESS_TOKEN credential in the tool environment",
    );
  }
  return { type: "oauth2", accessToken };
}

export const x = defineTool<BaseEnv>({
  id: "@intx/tools-x/sidecar-bundle",
  factory: () => {
    const tools = createXTools({ auth: readXAuthentication() });
    return {
      definitions: tools.definitions,
      run: (call, signal) => tools.run(call, signal),
      dispose: () => tools.dispose(),
    };
  },
});
