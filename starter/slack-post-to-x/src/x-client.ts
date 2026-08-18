import { createHmac, randomUUID } from "node:crypto";

const POST_URL = "https://api.x.com/2/tweets";
const ERROR_EXCERPT_LIMIT = 500;

export type XCredentials = Readonly<{
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}>;

export type PostReceipt = Readonly<{
  mode: "dry-run" | "live";
  postId: string;
  url?: string;
  text: string;
  postedAt: string;
}>;

export interface Publisher {
  readonly mode: PostReceipt["mode"];
  publish(text: string, signal: AbortSignal): Promise<PostReceipt>;
}

type PublisherDeps = {
  fetcher?: Fetcher;
  now?: () => Date;
  newId?: () => string;
};

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createPublisher(
  env: NodeJS.ProcessEnv,
  deps: PublisherDeps = {},
): Publisher {
  const now = deps.now ?? (() => new Date());
  if (env.X_LIVE !== "1") {
    return createDryRunPublisher({ now, newId: deps.newId });
  }

  const credentials = requireCredentials(env);
  const fetcher = deps.fetcher ?? fetch;
  return {
    mode: "live",
    async publish(text, signal) {
      const postId = await createPost(text, credentials, signal, fetcher);
      return Object.freeze({
        mode: "live",
        postId,
        url: `https://x.com/i/web/status/${postId}`,
        text,
        postedAt: now().toISOString(),
      });
    },
  };
}

export function createDryRunPublisher(
  deps: {
    now?: () => Date;
    newId?: () => string;
  } = {},
): Publisher {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  return {
    mode: "dry-run",
    async publish(text, signal) {
      signal.throwIfAborted();
      return Object.freeze({
        mode: "dry-run",
        postId: `dryrun-${newId()}`,
        text,
        postedAt: now().toISOString(),
      });
    },
  };
}

export function requirePostReceipt(input: unknown): PostReceipt {
  if (
    !isRecord(input) ||
    (input.mode !== "dry-run" && input.mode !== "live") ||
    typeof input.postId !== "string" ||
    input.postId === "" ||
    typeof input.text !== "string" ||
    typeof input.postedAt !== "string"
  ) {
    throw new Error("publish action did not return a valid receipt");
  }
  if (
    input.mode === "live" &&
    (typeof input.url !== "string" || input.url === "")
  ) {
    throw new Error("live publish receipt did not include a URL");
  }

  return Object.freeze({
    mode: input.mode,
    postId: input.postId,
    text: input.text,
    postedAt: input.postedAt,
    ...(typeof input.url === "string" ? { url: input.url } : {}),
  });
}

export function buildOAuthHeader(
  method: string,
  url: string,
  credentials: XCredentials,
  overrides: { nonce?: string; timestamp?: string } = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: overrides.nonce ?? randomUUID().replaceAll("-", ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:
      overrides.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const signatureParams = Object.entries(oauthParams)
    .map(([key, value]) => [rfc3986Encode(key), rfc3986Encode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? compareEncoded(leftValue, rightValue)
        : compareEncoded(leftKey, rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBase = [
    method.toUpperCase(),
    rfc3986Encode(url),
    rfc3986Encode(signatureParams),
  ].join("&");
  const signingKey = [
    rfc3986Encode(credentials.apiSecret),
    rfc3986Encode(credentials.accessTokenSecret),
  ].join("&");
  const signature = createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  return (
    "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .sort(([left], [right]) => compareEncoded(left, right))
      .map(([key, value]) => `${rfc3986Encode(key)}="${rfc3986Encode(value)}"`)
      .join(", ")
  );
}

async function createPost(
  text: string,
  credentials: XCredentials,
  signal: AbortSignal,
  fetcher: Fetcher,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(POST_URL, {
      method: "POST",
      headers: {
        Authorization: buildOAuthHeader("POST", POST_URL, credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal,
    });
  } catch (cause) {
    throw new Error(
      "X post request failed before a response; outcome unknown, so it was not retried",
      { cause },
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const excerpt = responseText
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, ERROR_EXCERPT_LIMIT);
    throw new Error(
      `X post request failed (${String(response.status)})${excerpt === "" ? "" : `: ${excerpt}`}`,
    );
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (cause) {
    throw unknownOutcome("response body could not be read", cause);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch (cause) {
    throw unknownOutcome("response was not valid JSON", cause);
  }
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    typeof payload.data.id !== "string" ||
    payload.data.id === ""
  ) {
    throw unknownOutcome("response did not include data.id");
  }
  return payload.data.id;
}

function unknownOutcome(detail: string, cause?: unknown): Error {
  return new Error(
    `X post ${detail}; outcome unknown, so inspect X before retrying`,
    cause === undefined ? undefined : { cause },
  );
}

function requireCredentials(env: NodeJS.ProcessEnv): XCredentials {
  const apiKey = nonEmpty(env.X_API_KEY);
  const apiSecret = nonEmpty(env.X_API_SECRET);
  const accessToken = nonEmpty(env.X_ACCESS_TOKEN);
  const accessTokenSecret = nonEmpty(env.X_ACCESS_TOKEN_SECRET);
  if (
    apiKey === undefined ||
    apiSecret === undefined ||
    accessToken === undefined ||
    accessTokenSecret === undefined
  ) {
    throw new Error("X_LIVE=1 requires all four X OAuth credentials");
  }
  return Object.freeze({ apiKey, apiSecret, accessToken, accessTokenSecret });
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function compareEncoded(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
