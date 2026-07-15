import { defineTool, type BaseEnv } from "@intx/agent";

import { createXTools } from "./index";

function readXAccessToken(): string {
  const accessToken = process.env["X_ACCESS_TOKEN"];
  if (accessToken === undefined || accessToken.trim() === "") {
    throw new Error(
      "@intx/tools-x requires an X_ACCESS_TOKEN credential in the tool environment",
    );
  }
  return accessToken;
}

export const x = defineTool<BaseEnv>({
  id: "@intx/tools-x/sidecar-bundle",
  factory: () => {
    const tools = createXTools({ accessToken: readXAccessToken() });
    return {
      definitions: tools.definitions,
      run: (call, signal) => tools.run(call, signal),
      dispose: () => tools.dispose(),
    };
  },
});
