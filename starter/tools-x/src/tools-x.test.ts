import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "@intx/agent";

import {
  createXTools,
  TOOL_DEFINITIONS,
  USER_TOOL_NAMES,
  type XFetch,
  type XFetchInit,
} from "./index";
import { x } from "./sidecar-bundle";

type CapturedRequest = { url: URL; init: XFetchInit };

function captureRequests(
  response: Response = Response.json({ data: { ok: true } }),
): { calls: CapturedRequest[]; fetch: XFetch } {
  const calls: CapturedRequest[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(response.clone());
    },
  };
}

const signal = new AbortController().signal;

const MINIMAL_CALLS = [
  ["getUsersMe", {}, "GET", "/2/users/me", undefined],
  ["getUsersById", { id: "1" }, "GET", "/2/users/1", undefined],
  [
    "getUsersByIds",
    { ids: ["1", "2"] },
    "GET",
    "/2/users?ids=1%2C2",
    undefined,
  ],
  [
    "getUsersByUsername",
    { username: "x_dev" },
    "GET",
    "/2/users/by/username/x_dev",
    undefined,
  ],
  [
    "getUsersByUsernames",
    { usernames: ["x_dev", "XDevelopers"] },
    "GET",
    "/2/users/by?usernames=x_dev%2CXDevelopers",
    undefined,
  ],
  ["getUsersPosts", { id: "1" }, "GET", "/2/users/1/tweets", undefined],
  ["getUsersMentions", { id: "1" }, "GET", "/2/users/1/mentions", undefined],
  [
    "getUsersTimeline",
    { id: "1" },
    "GET",
    "/2/users/1/timelines/reverse_chronological",
    undefined,
  ],
  ["getUsersFollowers", { id: "1" }, "GET", "/2/users/1/followers", undefined],
  ["getUsersFollowing", { id: "1" }, "GET", "/2/users/1/following", undefined],
  [
    "getUsersLikedPosts",
    { id: "1" },
    "GET",
    "/2/users/1/liked_tweets",
    undefined,
  ],
  ["getUsersRepostsOfMe", {}, "GET", "/2/users/reposts_of_me", undefined],
  ["getUsersBlocking", { id: "1" }, "GET", "/2/users/1/blocking", undefined],
  ["getUsersMuting", { id: "1" }, "GET", "/2/users/1/muting", undefined],
  [
    "getUsersAffiliates",
    { id: "1" },
    "GET",
    "/2/users/1/affiliates",
    undefined,
  ],
  [
    "followUser",
    { id: "1", target_user_id: "2" },
    "POST",
    "/2/users/1/following",
    '{"target_user_id":"2"}',
  ],
  [
    "unfollowUser",
    { source_user_id: "1", target_user_id: "2" },
    "DELETE",
    "/2/users/1/following/2",
    undefined,
  ],
  [
    "muteUser",
    { id: "1", target_user_id: "2" },
    "POST",
    "/2/users/1/muting",
    '{"target_user_id":"2"}',
  ],
  [
    "unmuteUser",
    { source_user_id: "1", target_user_id: "2" },
    "DELETE",
    "/2/users/1/muting/2",
    undefined,
  ],
  [
    "likePost",
    { id: "1", tweet_id: "3" },
    "POST",
    "/2/users/1/likes",
    '{"tweet_id":"3"}',
  ],
  [
    "unlikePost",
    { id: "1", tweet_id: "3" },
    "DELETE",
    "/2/users/1/likes/3",
    undefined,
  ],
  [
    "repostPost",
    { id: "1", tweet_id: "3" },
    "POST",
    "/2/users/1/retweets",
    '{"tweet_id":"3"}',
  ],
  [
    "unrepostPost",
    { id: "1", source_tweet_id: "3" },
    "DELETE",
    "/2/users/1/retweets/3",
    undefined,
  ],
] as const;

describe("@intx/tools-x Users tools", () => {
  test("publishes the exact 23 Users tools as closed standalone schemas", () => {
    expect(TOOL_DEFINITIONS.map((definition) => definition.name)).toEqual([
      ...USER_TOOL_NAMES,
    ]);
    expect(TOOL_DEFINITIONS).toHaveLength(23);

    for (const definition of TOOL_DEFINITIONS) {
      expect(definition.inputSchema["type"]).toBe("object");
      expect(definition.inputSchema["additionalProperties"]).toBe(false);
      expect(JSON.stringify(definition.inputSchema)).not.toContain('"$ref"');
    }

    const byIds = TOOL_DEFINITIONS.find(
      (definition) => definition.name === "getUsersByIds",
    );
    const properties = byIds?.inputSchema["properties"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties["ids"]?.["minItems"]).toBe(1);
    expect(properties["ids"]?.["maxItems"]).toBe(100);
    expect(properties["ids"]?.["uniqueItems"]).toBeUndefined();
    expect(properties["user.fields"]?.["uniqueItems"]).toBe(true);
  });

  test("maps every Users tool to the official method, path, query, and body", async () => {
    const capture = captureRequests();
    const tools = createXTools({
      accessToken: "test-token",
      fetch: capture.fetch,
    });

    for (const [name, args, method, pathAndQuery, body] of MINIMAL_CALLS) {
      const result = await tools.run(
        { id: `call-${name}`, name, arguments: args },
        signal,
      );
      expect(result.isError).not.toBe(true);
      const call = capture.calls.at(-1);
      expect(call?.init.method).toBe(method);
      expect(`${call?.url.pathname}${call?.url.search}`).toBe(pathAndQuery);
      expect(call?.init.body).toBe(body);
    }

    expect(capture.calls).toHaveLength(23);
  });

  test("preserves dotted projection keys and comma-joins array query values", async () => {
    const capture = captureRequests();
    const tools = createXTools({
      accessToken: "test-token",
      fetch: capture.fetch,
    });
    const result = await tools.run(
      {
        id: "query-call",
        name: "getUsersPosts",
        arguments: {
          id: "123",
          since_id: "456",
          max_results: 5,
          exclude: ["replies", "retweets"],
          start_time: "2026-07-15T12:00:00Z",
          "tweet.fields": ["id", "text"],
          "media.fields": ["media_key", "url"],
        },
      },
      signal,
    );

    expect(result.isError).not.toBe(true);
    const query = capture.calls[0]?.url.searchParams;
    expect(query?.get("since_id")).toBe("456");
    expect(query?.get("max_results")).toBe("5");
    expect(query?.get("exclude")).toBe("replies,retweets");
    expect(query?.get("start_time")).toBe("2026-07-15T12:00:00Z");
    expect(query?.get("tweet.fields")).toBe("id,text");
    expect(query?.get("media.fields")).toBe("media_key,url");
  });

  test("rejects invalid and undeclared arguments before making a request", async () => {
    const capture = captureRequests();
    const tools = createXTools({
      accessToken: "test-token",
      fetch: capture.fetch,
    });
    const cases = [
      ["getUsersByIds", { ids: [] }],
      ["getUsersByUsername", { username: "@invalid" }],
      ["getUsersPosts", { id: "1", max_results: 4 }],
      ["getUsersPosts", { id: "1", start_time: "not-a-date" }],
      ["getUsersPosts", { id: "1", start_time: "2026-02-31T12:00:00Z" }],
      ["getUsersPosts", { id: "1", "tweet.fields": ["id", "id"] }],
      ["getUsersMe", { surprise: true }],
      ["followUser", { id: "1" }],
    ] as const;

    for (const [name, arguments_] of cases) {
      const result = await tools.run(
        { id: `invalid-${name}`, name, arguments: arguments_ },
        signal,
      );
      expect(result).toMatchObject({
        isError: true,
        content: { code: "invalid_arguments" },
      });
    }
    expect(capture.calls).toHaveLength(0);
  });

  test("allows duplicate lookup IDs and usernames as the OpenAPI contract does", async () => {
    const capture = captureRequests();
    const tools = createXTools({
      accessToken: "test-token",
      fetch: capture.fetch,
    });
    for (const [name, arguments_] of [
      ["getUsersByIds", { ids: ["1", "1"] }],
      ["getUsersByUsernames", { usernames: ["x_dev", "x_dev"] }],
    ] as const) {
      const result = await tools.run(
        { id: `duplicate-${name}`, name, arguments: arguments_ },
        signal,
      );
      expect(result.isError).not.toBe(true);
    }
    expect(capture.calls).toHaveLength(2);
  });

  test("returns stable runner errors and preserves safe X API details", async () => {
    const unknownTools = createXTools({ accessToken: "test-token" });
    await expect(
      unknownTools.run(
        { id: "unknown", name: "notAnXTool", arguments: {} },
        signal,
      ),
    ).resolves.toEqual({
      callId: "unknown",
      content: { error: 'Unknown tool: "notAnXTool"' },
      isError: true,
    });

    const capture = captureRequests(
      Response.json({ title: "Too Many Requests" }, { status: 429 }),
    );
    const tools = createXTools({
      accessToken: "test-token",
      fetch: capture.fetch,
    });
    const result = await tools.run(
      { id: "rate-limit", name: "getUsersMe", arguments: {} },
      signal,
    );
    expect(result).toMatchObject({
      callId: "rate-limit",
      isError: true,
      content: {
        code: "x_api_http",
        status: 429,
        body: { title: "Too Many Requests" },
      },
    });

    await tools.dispose();
    await tools.dispose();
  });
});

describe("@intx/tools-x sidecar bundle", () => {
  const originalToken = process.env["X_ACCESS_TOKEN"];

  afterEach(() => {
    if (originalToken === undefined) delete process.env["X_ACCESS_TOKEN"];
    else process.env["X_ACCESS_TOKEN"] = originalToken;
  });

  test("uses the package-namespaced loader convention", () => {
    expect(x.id).toBe("@intx/tools-x/sidecar-bundle");
    expect(x.requires).toEqual([]);
  });

  test("fails clearly without the credential and constructs with it", () => {
    delete process.env["X_ACCESS_TOKEN"];
    expect(() => x({} as BaseEnv)).toThrow(/X_ACCESS_TOKEN/);

    process.env["X_ACCESS_TOKEN"] = "test-token";
    const bundle = x({} as BaseEnv);
    expect(bundle.definitions).toHaveLength(23);
  });
});
