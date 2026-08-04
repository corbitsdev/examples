import { defineTool, type BaseEnv } from "@intx/agent";

import type { PulseTarget } from "./types";
import type { XCommunityClient } from "./x-client";

export const X_GET_MENTIONS = "x_get_user_mentions";
export const X_GET_POSTS = "x_get_user_posts";

type XToolEnv = BaseEnv & {
  target: PulseTarget;
  xClient: XCommunityClient;
  xToolCalled?: boolean;
  lastToolError?: string;
};

/** Registers the read-only X tool used by the Community Listener agent. */
export function createMentionTools() {
  return createXTool(
    "mentions",
    X_GET_MENTIONS,
    "Fetch posts mentioning the requested X account for the current and previous seven-day periods.",
  );
}

/** Registers the read-only X tool used by the Content Analyst agent. */
export function createContentTools() {
  return createXTool(
    "posts",
    X_GET_POSTS,
    "Fetch original posts from the requested X account for the current and previous seven-day periods.",
  );
}

function createXTool(
  kind: "mentions" | "posts",
  name: string,
  description: string,
) {
  return defineTool<XToolEnv>({
    id: `@corbits/example-community-pulse/${kind}`,
    requires: ["target", "xClient"],
    factory: (env) => {
      // One call keeps the evidence window fixed if the model tries to retry.
      let called = false;
      return {
        definitions: [
          {
            name,
            description,
            // The workflow fixes the account and time window in env.
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
        async run(call, signal) {
          if (call.name !== name) {
            return failure(call.id, `Unknown tool ${call.name}`);
          }
          if (called) return failure(call.id, `${name} may be called only once`);
          called = true;
          try {
            const collection =
              kind === "mentions"
                ? await env.xClient.getMentions(env.target, signal)
                : await env.xClient.getPosts(env.target, signal);
            env.xToolCalled = true;
            return {
              callId: call.id,
              content: JSON.stringify(collection),
              detail: collection,
            };
          } catch (error) {
            const detail = message(error);
            env.lastToolError = detail;
            return failure(call.id, detail);
          }
        },
      };
    },
  });
}

function failure(callId: string, content: string) {
  return { callId, content, isError: true as const };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
