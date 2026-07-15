import { describe, expect, test } from "bun:test";

import {
  createXAPIClient,
  XAPIClientError,
  type XFetch,
  type XFetchInit,
} from "./client";

type FetchCall = {
  url: string;
  init: XFetchInit;
};

function createFetchHarness(response: Response) {
  const calls: FetchCall[] = [];
  const mockFetch: XFetch = (input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(response.clone());
  };
  return { calls, mockFetch };
}

function createJSONResponse(
  body: unknown,
  status = 200,
  headers?: Readonly<Record<string, string>>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function expectClientError(error: unknown, kind: XAPIClientError["kind"]) {
  expect(error).toBeInstanceOf(XAPIClientError);
  if (!(error instanceof XAPIClientError)) {
    throw new Error("expected XAPIClientError");
  }
  expect(error.kind).toBe(kind);
  return error;
}

describe("createXAPIClient", () => {
  test("rejects invalid construction options", () => {
    expect(() => createXAPIClient({ accessToken: "" })).toThrow(
      /must not be empty/,
    );
    expect(() =>
      createXAPIClient({ accessToken: "token", baseURL: "file:///tmp/x" }),
    ).toThrow(/HTTP or HTTPS/);
    expect(() =>
      createXAPIClient({ accessToken: "token", timeoutMs: 0 }),
    ).toThrow(/positive number/);
  });

  test("builds an authenticated request with deterministic query encoding", async () => {
    const harness = createFetchHarness(createJSONResponse({ data: [] }));
    const client = createXAPIClient({
      accessToken: "secret-token",
      baseURL: "https://example.test/",
      fetch: harness.mockFetch,
    });

    await client.request({
      method: "GET",
      path: "/2/users",
      query: {
        ids: ["1", "2"],
        label: "Kathmandu & 東京",
        active: false,
        count: 0,
        omitted: undefined,
        empty: [],
      },
    });

    expect(harness.calls).toHaveLength(1);
    const call = harness.calls[0];
    expect(call?.url).toBe(
      "https://example.test/2/users?ids=1%2C2&label=Kathmandu+%26+%E6%9D%B1%E4%BA%AC&active=false&count=0",
    );
    expect(call?.init.headers["Authorization"]).toBe("Bearer secret-token");
    expect(call?.init.headers["User-Agent"]).toBe("@intx/tools-x/0.1.0");
    expect(call?.init.headers["Accept"]).toBe("application/json");
    expect(call?.init.redirect).toBe("error");
    expect(call?.init.credentials).toBe("omit");
  });

  test("serializes JSON bodies and owns the content type", async () => {
    const harness = createFetchHarness(createJSONResponse({ data: true }));
    const client = createXAPIClient({
      accessToken: "token",
      baseURL: "https://example.test/api/",
      fetch: harness.mockFetch,
    });

    await client.request({
      method: "POST",
      path: "/2/users/1/following",
      body: { target_user_id: "2" },
    });

    const call = harness.calls[0];
    expect(call?.url).toBe("https://example.test/2/users/1/following");
    expect(call?.init.body).toBe('{"target_user_id":"2"}');
    expect(call?.init.headers["Content-Type"]).toBe("application/json");
  });

  test("rejects unsafe paths and invalid query values before fetching", async () => {
    const harness = createFetchHarness(createJSONResponse({}));
    const client = createXAPIClient({
      accessToken: "token",
      fetch: harness.mockFetch,
    });

    for (const path of [
      "https://attacker.test/steal",
      "//attacker.test/steal",
      "/\\attacker.test/steal",
      "/\t/attacker.test/steal",
      "/\n/attacker.test/steal",
      "/\r/attacker.test/steal",
      "/2/users?redirect=bad",
      "/2/users#bad",
    ]) {
      await expect(
        client.request({ method: "GET", path }),
      ).rejects.toMatchObject({ kind: "request" });
    }

    await expect(
      client.request({
        method: "GET",
        path: "/2/users",
        query: { invalid: Number.NaN },
      }),
    ).rejects.toMatchObject({ kind: "request" });
    expect(harness.calls).toHaveLength(0);
  });

  test("returns JSON objects and normalizes empty success responses", async () => {
    const jsonHarness = createFetchHarness(
      createJSONResponse({ data: { id: "1" } }),
    );
    const jsonClient = createXAPIClient({
      accessToken: "token",
      fetch: jsonHarness.mockFetch,
    });
    await expect(
      jsonClient.request({ method: "GET", path: "/2/users/me" }),
    ).resolves.toEqual({ data: { id: "1" } });

    const emptyHarness = createFetchHarness(
      new Response(null, { status: 204 }),
    );
    const emptyClient = createXAPIClient({
      accessToken: "token",
      fetch: emptyHarness.mockFetch,
    });
    await expect(
      emptyClient.request({ method: "DELETE", path: "/2/users/1" }),
    ).resolves.toEqual({});
  });

  test("rejects malformed or non-object success responses", async () => {
    for (const response of [
      new Response("not-json", { status: 200 }),
      createJSONResponse(["unexpected"]),
    ]) {
      const harness = createFetchHarness(response);
      const client = createXAPIClient({
        accessToken: "token",
        fetch: harness.mockFetch,
      });
      await expect(
        client.request({ method: "GET", path: "/2/users/me" }),
      ).rejects.toMatchObject({ kind: "response" });
    }
  });

  test("redacts the token from malformed success parse errors", async () => {
    const accessToken = "secret-token-with-realistic-oauth-length";
    const harness = createFetchHarness(
      new Response(`${accessToken} suffix`, { status: 200 }),
    );
    const client = createXAPIClient({
      accessToken,
      fetch: harness.mockFetch,
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const error = expectClientError(caught, "response");
    expect(error.cause).toBeUndefined();
    expect(String(error)).not.toContain(accessToken.slice(0, 10));
  });

  test("preserves safe X error details and redacts the token", async () => {
    const harness = createFetchHarness(
      createJSONResponse(
        { errors: [{ message: "token secret-token is invalid" }] },
        429,
        {
          "retry-after": "10",
          "x-rate-limit-remaining": "0",
          "x-transaction-id": "echo-secret-token",
          "x-private-debug": "do-not-expose",
        },
      ),
    );
    const client = createXAPIClient({
      accessToken: "secret-token",
      fetch: harness.mockFetch,
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const error = expectClientError(caught, "http");
    expect(error.status).toBe(429);
    expect(JSON.stringify(error.body)).toContain("[REDACTED]");
    expect(JSON.stringify(error.body)).not.toContain("secret-token");
    expect(error.headers).toEqual({
      "content-type": "application/json",
      "retry-after": "10",
      "x-rate-limit-remaining": "0",
      "x-transaction-id": "echo-[REDACTED]",
    });
  });

  test("redacts tokens encoded with JSON escapes", async () => {
    const harness = createFetchHarness(
      new Response('{"secret\\u002dtoken":"secret\\u002dtoken"}', {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createXAPIClient({
      accessToken: "secret-token",
      fetch: harness.mockFetch,
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const error = expectClientError(caught, "http");
    expect(JSON.stringify(error.body)).toContain("[REDACTED]");
    expect(JSON.stringify(error.body)).not.toContain("secret-token");
  });

  test("does not expose a token prefix at the error-body size boundary", async () => {
    const harness = createFetchHarness(
      new Response(`${"x".repeat(65_530)}secret-token`, { status: 500 }),
    );
    const client = createXAPIClient({
      accessToken: "secret-token",
      fetch: harness.mockFetch,
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const error = expectClientError(caught, "http");
    expect(String(error.body)).not.toEndWith("secret");
    expect(String(error.body)).not.toContain("secret-token");
  });

  test("handles text HTTP errors without exposing unrestricted headers", async () => {
    const harness = createFetchHarness(
      new Response("upstream unavailable", {
        status: 503,
        headers: {
          "content-type": "text/plain;charset=utf-8",
          "x-private-debug": "hidden",
        },
      }),
    );
    const client = createXAPIClient({
      accessToken: "token",
      fetch: harness.mockFetch,
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const error = expectClientError(caught, "http");
    expect(error.body).toBe("upstream unavailable");
    expect(error.headers).toEqual({
      "content-type": "text/plain;charset=utf-8",
    });
  });

  test("distinguishes pre-abort, in-flight abort, timeout, and transport failure", async () => {
    let fetchCount = 0;
    const pendingFetch: XFetch = (_input, init) => {
      fetchCount += 1;
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    };

    const preAborted = new AbortController();
    preAborted.abort();
    const client = createXAPIClient({
      accessToken: "token",
      timeoutMs: 20,
      fetch: pendingFetch,
    });
    await expect(
      client.request({ method: "GET", path: "/2/users/me" }, preAborted.signal),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(fetchCount).toBe(0);

    const controller = new AbortController();
    const aborted = client.request(
      { method: "GET", path: "/2/users/me" },
      controller.signal,
    );
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ kind: "aborted" });

    await expect(
      client.request({ method: "GET", path: "/2/users/me" }),
    ).rejects.toMatchObject({ kind: "timeout" });

    let transportCount = 0;
    const transportClient = createXAPIClient({
      accessToken: "secret-token",
      fetch: () => {
        transportCount += 1;
        return Promise.reject(new Error("dial failed for secret-token"));
      },
    });
    let caught: unknown;
    try {
      await transportClient.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    const transportError = expectClientError(caught, "transport");
    expect(transportError.cause).toBeInstanceOf(Error);
    expect(String(transportError.cause)).not.toContain("secret-token");
    expect(transportCount).toBe(1);
  });

  test("classifies timeout and caller abort while reading the response body", async () => {
    const delayedBodyFetch: XFetch = (_input, init) =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise((_resolve, reject) => {
            if (init.signal.aborted) {
              reject(new Error("aborted"));
              return;
            }
            init.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      });

    const timeoutClient = createXAPIClient({
      accessToken: "token",
      timeoutMs: 5,
      fetch: delayedBodyFetch,
    });
    await expect(
      timeoutClient.request({ method: "GET", path: "/2/users/me" }),
    ).rejects.toMatchObject({ kind: "timeout" });

    const controller = new AbortController();
    const abortClient = createXAPIClient({
      accessToken: "token",
      timeoutMs: 1_000,
      fetch: delayedBodyFetch,
    });
    const request = abortClient.request(
      { method: "GET", path: "/2/users/me" },
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await expect(request).rejects.toMatchObject({ kind: "aborted" });
  });

  test("does not follow redirects or retry failed requests", async () => {
    let fetchCount = 0;
    const client = createXAPIClient({
      accessToken: "token",
      fetch: (_input, init) => {
        fetchCount += 1;
        expect(init.redirect).toBe("error");
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://attacker.test/steal" },
          }),
        );
      },
    });

    await expect(
      client.request({ method: "GET", path: "/2/users/me" }),
    ).rejects.toMatchObject({ kind: "http", status: 302 });
    expect(fetchCount).toBe(1);
  });
});
