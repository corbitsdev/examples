import {
  createOAuth1AuthorizationHeader,
  type XOAuth1Credentials,
  type XOAuth1SigningOptions,
} from "./oauth1";

const DEFAULT_API_BASE_URL = "https://api.x.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "@intx/tools-x/0.1.0";
const MAX_ERROR_BODY_LENGTH = 65_536;
const MAX_ERROR_MESSAGE_LENGTH = 2_048;

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
  "x-transaction-id",
] as const;

export type XQueryScalar = string | number | boolean;
export type XQueryValue = XQueryScalar | readonly XQueryScalar[] | undefined;

export type XAPIRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Readonly<Record<string, XQueryValue>>;
  body?: Readonly<Record<string, unknown>>;
};

export type XFetchHeaders = {
  get(name: string): string | null;
};

export type XFetchResponse = {
  status: number;
  headers: XFetchHeaders;
  text(): Promise<string>;
};

export type XFetchInit = {
  method: XAPIRequest["method"];
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
  redirect: "error";
  credentials: "omit";
};

export type XFetch = (input: URL, init: XFetchInit) => Promise<XFetchResponse>;

export type XOAuth2Credentials = {
  type: "oauth2";
  accessToken: string;
};

export type XAuthentication = XOAuth1Credentials | XOAuth2Credentials;

export type XAPIClientOptions = {
  auth: XAuthentication;
  baseURL?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetch?: XFetch;
  oauth1?: XOAuth1SigningOptions;
};

export type XAPIClientErrorKind =
  | "configuration"
  | "request"
  | "transport"
  | "timeout"
  | "aborted"
  | "http"
  | "response";

type XAPIClientErrorOptions = {
  cause?: unknown;
  status?: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
};

export class XAPIClientError extends Error {
  readonly kind: XAPIClientErrorKind;
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;

  constructor(
    kind: XAPIClientErrorKind,
    message: string,
    opts: XAPIClientErrorOptions = {},
  ) {
    super(
      message,
      opts.cause === undefined ? undefined : { cause: opts.cause },
    );
    this.name = "XAPIClientError";
    this.kind = kind;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.body !== undefined) this.body = opts.body;
    if (opts.headers !== undefined) this.headers = opts.headers;
  }
}

export interface XAPIClient {
  request(
    request: XAPIRequest,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}

function configurationError(message: string): XAPIClientError {
  return new XAPIClientError("configuration", message);
}

function normalizeBaseURL(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new XAPIClientError("configuration", "X API base URL is invalid", {
      cause,
    });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw configurationError("X API base URL must use HTTP or HTTPS");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw configurationError(
      "X API base URL must not contain credentials, query, or fragment",
    );
  }
  return url;
}

function validateRelativePath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(path) ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new XAPIClientError(
      "request",
      "X API path must be a relative absolute-path without query or fragment",
    );
  }
}

function serializeQueryValue(key: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value
      .map((item) => {
        if (!isQueryScalar(item)) {
          throw new XAPIClientError(
            "request",
            `X API query parameter ${JSON.stringify(key)} contains an invalid array value`,
          );
        }
        return String(item);
      })
      .join(",");
  }
  if (!isQueryScalar(value)) {
    throw new XAPIClientError(
      "request",
      `X API query parameter ${JSON.stringify(key)} has an invalid value`,
    );
  }
  return String(value);
}

function isQueryScalar(value: unknown): value is XQueryScalar {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" || typeof value === "boolean";
}

function addQuery(url: URL, query: XAPIRequest["query"]): void {
  if (query === undefined) return;
  for (const [key, value] of Object.entries(query)) {
    if (key === "") {
      throw new XAPIClientError(
        "request",
        "X API query parameter name must not be empty",
      );
    }
    const serialized = serializeQueryValue(key, value);
    if (serialized !== null) url.searchParams.append(key, serialized);
  }
}

function serializeBody(request: XAPIRequest): string | undefined {
  if (request.body === undefined) return undefined;
  if (request.method === "GET") {
    throw new XAPIClientError(
      "request",
      "GET requests must not include a body",
    );
  }
  try {
    return JSON.stringify(request.body);
  } catch (cause) {
    throw new XAPIClientError("request", "X API request body is not JSON", {
      cause,
    });
  }
}

function secretValues(auth: XAuthentication): string[] {
  const values =
    auth.type === "oauth1"
      ? [
          auth.apiKey,
          auth.apiSecret,
          auth.accessToken,
          auth.accessTokenSecret,
        ]
      : [auth.accessToken];
  return [...values].sort((left, right) => right.length - left.length);
}

function redact(value: string, secrets: readonly string[], maxLength: number): string {
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted.slice(0, maxLength);
}

function safeCause(): Error {
  // Fetch implementations and HTTP wrappers may include the complete
  // Authorization header in their exception message. OAuth1 headers also
  // contain a derived signature that cannot be redacted from the four raw
  // credential values. Preserve the error classification, not the potentially
  // credential-bearing upstream message.
  return new Error("upstream request details withheld");
}

function safeErrorBody(text: string, secrets: readonly string[]): unknown {
  if (text.length > MAX_ERROR_BODY_LENGTH) {
    return redact(text, secrets, MAX_ERROR_BODY_LENGTH);
  }
  try {
    return redactJSONValue(JSON.parse(text), secrets);
  } catch {
    return redact(text, secrets, MAX_ERROR_BODY_LENGTH);
  }
}

function redactJSONValue(
  value: unknown,
  secrets: readonly string[],
  depth = 0,
): unknown {
  if (typeof value === "string") {
    return redact(value, secrets, MAX_ERROR_BODY_LENGTH);
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= 64) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.map((item) => redactJSONValue(item, secrets, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      redact(key, secrets, MAX_ERROR_BODY_LENGTH),
      redactJSONValue(item, secrets, depth + 1),
    ]),
  );
}

function selectSafeHeaders(
  headers: XFetchHeaders,
  secrets: readonly string[],
): Readonly<Record<string, string>> {
  const safe: Record<string, string> = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) {
      safe[name] = redact(value, secrets, MAX_ERROR_MESSAGE_LENGTH);
    }
  }
  return Object.freeze(safe);
}

function parseSuccessBody(text: string): Record<string, unknown> {
  if (text.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new XAPIClientError(
      "response",
      "X API returned a non-JSON success response",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new XAPIClientError(
      "response",
      "X API success response must be a JSON object",
    );
  }
  return Object.fromEntries(Object.entries(parsed));
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

export function createXAPIClient(opts: XAPIClientOptions): XAPIClient {
  if (opts.auth.accessToken.trim() === "") {
    throw configurationError("X access token must not be empty");
  }
  if (opts.auth.type === "oauth1") {
    if (opts.auth.apiKey.trim() === "") {
      throw configurationError("X API key must not be empty");
    }
    if (opts.auth.apiSecret.trim() === "") {
      throw configurationError("X API secret must not be empty");
    }
    if (opts.auth.accessTokenSecret.trim() === "") {
      throw configurationError("X access token secret must not be empty");
    }
  }
  const baseURL = normalizeBaseURL(opts.baseURL ?? DEFAULT_API_BASE_URL);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw configurationError("X API timeout must be a positive number");
  }
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  if (userAgent.trim() === "") {
    throw configurationError("X API user agent must not be empty");
  }
  const fetchImpl: XFetch =
    opts.fetch ??
    ((input, init) =>
      fetch(input, {
        ...init,
        headers: { ...init.headers },
      }));
  const auth = opts.auth;
  const secrets = secretValues(auth);

  return {
    async request(request, signal) {
      validateRelativePath(request.path);
      if (isAborted(signal)) {
        throw new XAPIClientError("aborted", "X API request was aborted");
      }

      const url = new URL(request.path, baseURL);
      if (url.origin !== baseURL.origin) {
        throw new XAPIClientError(
          "request",
          "X API path must resolve to the configured API origin",
        );
      }
      addQuery(url, request.query);
      const body = serializeBody(request);
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          Authorization:
            auth.type === "oauth1"
              ? createOAuth1AuthorizationHeader(
                  request.method,
                  url,
                  auth,
                  opts.oauth1,
                )
              : `Bearer ${auth.accessToken}`,
          "User-Agent": userAgent,
        };
        if (body !== undefined) headers["Content-Type"] = "application/json";

        let response: XFetchResponse;
        try {
          response = await fetchImpl(url, {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
            signal: controller.signal,
            redirect: "error",
            credentials: "omit",
          });
        } catch {
          if (timedOut) {
            throw new XAPIClientError(
              "timeout",
              `X API request timed out after ${String(timeoutMs)}ms`,
            );
          }
          if (isAborted(signal)) {
            throw new XAPIClientError("aborted", "X API request was aborted");
          }
          throw new XAPIClientError(
            "transport",
            "X API request failed before receiving a response",
            { cause: safeCause() },
          );
        }

        let responseText: string;
        try {
          responseText = await response.text();
        } catch {
          if (timedOut) {
            throw new XAPIClientError(
              "timeout",
              `X API request timed out after ${String(timeoutMs)}ms`,
            );
          }
          if (isAborted(signal)) {
            throw new XAPIClientError("aborted", "X API request was aborted");
          }
          throw new XAPIClientError(
            "response",
            "X API response body could not be read",
            { cause: safeCause() },
          );
        }

        if (response.status < 200 || response.status >= 300) {
          throw new XAPIClientError(
            "http",
            `X API request failed with status ${String(response.status)}`,
            {
              status: response.status,
              body: safeErrorBody(responseText, secrets),
              headers: selectSafeHeaders(response.headers, secrets),
            },
          );
        }

        return parseSuccessBody(responseText);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
