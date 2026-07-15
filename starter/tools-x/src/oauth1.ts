import { createHmac, randomBytes } from "node:crypto";

export type XOAuth1Credentials = {
  type: "oauth1";
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export type XOAuth1SigningOptions = {
  nonce?: () => string;
  timestamp?: () => number;
};

type OAuthParameter = readonly [name: string, value: string];

function compareEncoded(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function configurationError(message: string): Error {
  return new Error(message);
}

function requireCredential(value: string, label: string): void {
  if (value.trim() === "") {
    throw configurationError(`${label} must not be empty`);
  }
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function normalizedBaseURL(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname || "/"}`;
}

function defaultNonce(): string {
  return randomBytes(24).toString("base64url");
}

function defaultTimestamp(): number {
  return Math.floor(Date.now() / 1_000);
}

function normalizedParameters(
  url: URL,
  oauthParameters: readonly OAuthParameter[],
): string {
  const parameters: OAuthParameter[] = [
    ...url.searchParams.entries(),
    ...oauthParameters,
  ];
  return parameters
    .map(([name, value]) => [percentEncode(name), percentEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameOrder = compareEncoded(leftName, rightName);
      return nameOrder === 0 ? compareEncoded(leftValue, rightValue) : nameOrder;
    })
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

/**
 * Build an OAuth 1.0a HMAC-SHA1 Authorization header for the exact URL that
 * will be transmitted. JSON request bodies are intentionally not included in
 * OAuth parameter normalization.
 */
export function createOAuth1AuthorizationHeader(
  method: string,
  url: URL,
  credentials: XOAuth1Credentials,
  opts: XOAuth1SigningOptions = {},
): string {
  requireCredential(credentials.apiKey, "X API key");
  requireCredential(credentials.apiSecret, "X API secret");
  requireCredential(credentials.accessToken, "X access token");
  requireCredential(credentials.accessTokenSecret, "X access token secret");

  const nonce = (opts.nonce ?? defaultNonce)();
  if (nonce === "" || /[\u0000-\u001f\u007f]/u.test(nonce)) {
    throw configurationError("X OAuth nonce must be a non-empty safe string");
  }
  const timestamp = (opts.timestamp ?? defaultTimestamp)();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw configurationError(
      "X OAuth timestamp must be a non-negative safe integer",
    );
  }

  const oauthParameters: OAuthParameter[] = [
    ["oauth_consumer_key", credentials.apiKey],
    ["oauth_nonce", nonce],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", String(timestamp)],
    ["oauth_token", credentials.accessToken],
  ];
  const parameterString = normalizedParameters(url, oauthParameters);
  const signatureBaseString = [
    method.toUpperCase(),
    normalizedBaseURL(url),
    parameterString,
  ]
    .map(percentEncode)
    .join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(signatureBaseString)
    .digest("base64");

  return (
    "OAuth " +
    [...oauthParameters, ["oauth_signature", signature] as const]
      .sort(([left], [right]) => compareEncoded(left, right))
      .map(([name, value]) => `${percentEncode(name)}="${percentEncode(value)}"`)
      .join(", ")
  );
}
