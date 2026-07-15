import { describe, expect, test } from "bun:test";

import {
  createXAPIClient,
  XAPIClientError,
  type XFetch,
  type XFetchInit,
} from "./client";
import {
  createOAuth1AuthorizationHeader,
  type XOAuth1Credentials,
} from "./oauth1";

const credentials: XOAuth1Credentials = {
  type: "oauth1",
  apiKey: "consumer-key",
  apiSecret: "consumer-secret",
  accessToken: "access-token",
  accessTokenSecret: "access-token-secret",
};

const deterministicSigning = {
  nonce: () => "fixed-nonce",
  timestamp: () => 1_752_576_000,
};

describe("OAuth 1.0a signing", () => {
  test("matches the RFC 5849 HMAC-SHA1 signature vector", () => {
    const url = new URL(
      "http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b&c2=&a3=2%20q",
    );
    const header = createOAuth1AuthorizationHeader(
      "POST",
      url,
      {
        type: "oauth1",
        apiKey: "9djdj82h48djs9d2",
        apiSecret: "j49sk3j29djd",
        accessToken: "kkk9d7dh3k39sjv7",
        accessTokenSecret: "dh893hdasih9",
      },
      {
        nonce: () => "7d8f3e4a",
        timestamp: () => 137_131_201,
      },
    );

    expect(header).toContain(
      'oauth_signature="r6%2FTJjbCOr97%2F%2BUU0NsvSne7s5g%3D"',
    );
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
  });

  test("signs the final transmitted URL and excludes JSON bodies", async () => {
    const calls: Array<{ url: string; init: XFetchInit }> = [];
    const fetch: XFetch = (url, init) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(Response.json({ data: { ok: true } }));
    };
    const client = createXAPIClient({
      auth: credentials,
      oauth1: deterministicSigning,
      baseURL: "https://example.test",
      fetch,
    });

    await client.request({
      method: "POST",
      path: "/2/users/1/following",
      query: { label: "space & 東京", empty: "" },
      body: { target_user_id: "2" },
    });
    await client.request({
      method: "POST",
      path: "/2/users/1/following",
      query: { label: "space & 東京", empty: "" },
      body: { target_user_id: "different-json-body" },
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://example.test/2/users/1/following?label=space+%26+%E6%9D%B1%E4%BA%AC&empty=",
      "https://example.test/2/users/1/following?label=space+%26+%E6%9D%B1%E4%BA%AC&empty=",
    ]);
    expect(calls[0]?.init.headers["Authorization"]).toStartWith("OAuth ");
    expect(calls[0]?.init.headers["Authorization"]).toBe(
      calls[1]?.init.headers["Authorization"],
    );
  });

  test("rejects unsafe requests before signing or fetching", async () => {
    let fetchCount = 0;
    const client = createXAPIClient({
      auth: credentials,
      oauth1: deterministicSigning,
      fetch: () => {
        fetchCount += 1;
        return Promise.resolve(Response.json({}));
      },
    });
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      client.request({ method: "GET", path: "//attacker.test/steal" }),
    ).rejects.toMatchObject({ kind: "request" });
    await expect(
      client.request(
        { method: "GET", path: "/2/users/me" },
        aborted.signal,
      ),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(fetchCount).toBe(0);
  });

  test("redacts every OAuth1 credential value from failures", async () => {
    const client = createXAPIClient({
      auth: credentials,
      oauth1: deterministicSigning,
      fetch: (_url, init) =>
        Promise.reject(
          new Error(`wrapper exposed ${init.headers["Authorization"]}`),
        ),
    });

    let caught: unknown;
    try {
      await client.request({ method: "GET", path: "/2/users/me" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XAPIClientError);
    expect(caught).toMatchObject({ kind: "transport" });
    const rendered = String((caught as Error).cause);
    for (const value of Object.values(credentials)) {
      if (value === "oauth1") continue;
      expect(rendered).not.toContain(value);
      expect(rendered).not.toContain(encodeURIComponent(value));
    }
    expect(rendered).not.toContain("oauth_signature");
    expect(rendered).toBe("Error: upstream request details withheld");
  });
});
