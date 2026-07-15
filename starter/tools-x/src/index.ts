import type {
  ToolDefinition,
  ToolResult,
  ToolRunner,
} from "@intx/types/runtime";

import {
  createXAPIClient,
  XAPIClientError,
  type XAPIClientOptions,
} from "./client";
import { TOOL_DEFINITIONS } from "./definitions";
import { createUserToolHandlers } from "./handlers";

export {
  createXAPIClient,
  XAPIClientError,
  type XAPIClient,
  type XAPIClientErrorKind,
  type XAPIClientOptions,
  type XAPIRequest,
  type XFetch,
  type XFetchHeaders,
  type XFetchInit,
  type XFetchResponse,
  type XQueryScalar,
  type XQueryValue,
} from "./client";
export { TOOL_DEFINITIONS } from "./definitions";
export { USER_TOOL_NAMES, type XUserToolName } from "./users/operations";

export type XToolsOptions = XAPIClientOptions;

export interface XTools extends ToolRunner {
  readonly definitions: ToolDefinition[];
  dispose(): Promise<void>;
}

export function createXTools(opts: XToolsOptions): XTools {
  const client = createXAPIClient(opts);
  const handlers = createUserToolHandlers(client);
  let disposed = false;

  return {
    definitions: TOOL_DEFINITIONS,
    async run(call, signal): Promise<ToolResult> {
      const handler = handlers.get(call.name);
      if (handler === undefined) {
        return {
          callId: call.id,
          content: { error: `Unknown tool: ${JSON.stringify(call.name)}` },
          isError: true,
        };
      }
      try {
        return await handler(call, signal);
      } catch (cause) {
        const content =
          cause instanceof XAPIClientError
            ? {
                error: cause.message,
                code: `x_api_${cause.kind}`,
                ...(cause.status === undefined ? {} : { status: cause.status }),
                ...(cause.body === undefined ? {} : { body: cause.body }),
                ...(cause.headers === undefined
                  ? {}
                  : { headers: cause.headers }),
              }
            : { error: "X tool execution failed", code: "x_tool_failed" };
        return { callId: call.id, content, isError: true };
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
    },
  };
}
