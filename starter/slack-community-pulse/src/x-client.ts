import { createHmac, randomBytes } from "node:crypto";

import type { PulseTarget, XPost, XUser, XWeeklyCollection } from "./types";

const API_ORIGIN = "https://api.x.com";
const MAX_PAGES = 2;

type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

type XAPIUser = {
  id: string;
  name: string;
  username: string;
  public_metrics: { followers_count: number };
};

type XAPIPost = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    like_count: number;
    reply_count: number;
    retweet_count: number;
    quote_count: number;
  };
};

type XPostPage = {
  data?: XAPIPost[];
  includes?: { users?: XAPIUser[] };
  meta: { next_token?: string };
};

export type XCommunityClient = {
  getMentions(
    target: PulseTarget,
    signal?: AbortSignal,
  ): Promise<XWeeklyCollection>;
  getPosts(
    target: PulseTarget,
    signal?: AbortSignal,
  ): Promise<XWeeklyCollection>;
};

export function createXCommunityClient(
  credentials: XCredentials,
  fetchImpl: typeof fetch = fetch,
): XCommunityClient {
  // The two analyst agents run in parallel, so they share this account lookup.
  const users = new Map<string, Promise<XUser>>();

  async function request<T>(url: URL, signal?: AbortSignal): Promise<T> {
    const response = await fetchImpl(url, {
      headers: { Authorization: buildOAuthHeader(url, credentials) },
      signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `X API returned ${String(response.status)}: ${body.slice(0, 500)}`,
      );
    }
    return JSON.parse(body) as T;
  }

  async function getUser(username: string, signal?: AbortSignal) {
    const key = username.toLowerCase();
    const cached = users.get(key);
    if (cached) return cached;

    const url = new URL(
      `/2/users/by/username/${encodeURIComponent(username)}`,
      API_ORIGIN,
    );
    url.searchParams.set("user.fields", "id,name,username,public_metrics");
    const pending = request<{ data: XAPIUser }>(url, signal)
      .then(({ data }) => toUser(data))
      .catch((error) => {
        users.delete(key);
        throw error;
      });
    users.set(key, pending);
    return pending;
  }

  async function getPostPages(
    kind: "mentions" | "posts",
    userId: string,
    start: Date,
    end: Date,
    signal?: AbortSignal,
  ) {
    const endpoint = kind === "mentions" ? "mentions" : "tweets";
    const posts: XPost[] = [];
    let token: string | undefined;
    let truncated = false;

    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const url = new URL(`/2/users/${userId}/${endpoint}`, API_ORIGIN);
      url.searchParams.set("start_time", start.toISOString());
      url.searchParams.set("end_time", end.toISOString());
      url.searchParams.set("max_results", "100");
      url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set("user.fields", "id,name,username,public_metrics");
      if (kind === "posts") url.searchParams.set("exclude", "retweets,replies");
      if (token) url.searchParams.set("pagination_token", token);

      const page = await request<XPostPage>(url, signal);
      const authors = new Map(
        (page.includes?.users ?? []).map((user) => [user.id, toUser(user)]),
      );
      for (const post of page.data ?? []) posts.push(toPost(post, authors));

      token = page.meta.next_token;
      if (!token) break;
      if (pageNumber === MAX_PAGES - 1) truncated = true;
    }
    return { posts, truncated };
  }

  async function collect(
    kind: "mentions" | "posts",
    target: PulseTarget,
    signal?: AbortSignal,
  ): Promise<XWeeklyCollection> {
    const account = await getUser(target.username, signal);
    const currentStart = new Date(target.currentPeriod.start);

    // One 14-day request covers both adjacent weeks and avoids duplicate calls.
    const result = await getPostPages(
      kind,
      account.id,
      new Date(target.previousPeriod.start),
      new Date(target.currentPeriod.end),
      signal,
    );
    return {
      ...target,
      username: account.username,
      account,
      current: result.posts.filter(
        (post) => Date.parse(post.createdAt) >= currentStart.getTime(),
      ),
      previous: result.posts.filter(
        (post) => Date.parse(post.createdAt) < currentStart.getTime(),
      ),
      truncated: result.truncated,
    };
  }

  return {
    getMentions: (target, signal) => collect("mentions", target, signal),
    getPosts: (target, signal) => collect("posts", target, signal),
  };
}

function buildOAuthHeader(url: URL, credentials: XCredentials): string {
  const oauth = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1_000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  // OAuth 1.0 signs query parameters as well as the endpoint URL.
  const parameters = [...Object.entries(oauth), ...url.searchParams.entries()]
    .map(([key, value]) => ({ key: encode(key), value: encode(value) }))
    .sort((left, right) =>
      left.key === right.key
        ? left.value.localeCompare(right.value)
        : left.key.localeCompare(right.key),
    )
    .map(({ key, value }) => `${key}=${value}`)
    .join("&");
  const signature = createHmac(
    "sha1",
    `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`,
  )
    .update(
      [
        "GET",
        encode(`${url.origin}${url.pathname}`),
        encode(parameters),
      ].join("&"),
    )
    .digest("base64");

  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(", ")}`;
}

function toPost(post: XAPIPost, users: Map<string, XUser>): XPost {
  const author = users.get(post.author_id);
  if (!author) {
    throw new Error(`X response omitted the author for post ${post.id}`);
  }
  return {
    id: post.id,
    url: `https://x.com/${author.username}/status/${post.id}`,
    text: post.text,
    author,
    createdAt: post.created_at,
    metrics: {
      likes: post.public_metrics.like_count,
      replies: post.public_metrics.reply_count,
      reposts: post.public_metrics.retweet_count,
      quotes: post.public_metrics.quote_count,
    },
  };
}

function toUser(user: XAPIUser): XUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    followers: user.public_metrics.followers_count,
  };
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
