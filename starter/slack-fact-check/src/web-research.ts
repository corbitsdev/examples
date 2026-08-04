import { defineTool, type BaseEnv } from "@intx/agent";

import type { WebResearchConfig } from "./types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";
const FETCH_TIMEOUT_MS = 30_000;
const RESULT_COUNT = 5;
const EXCERPT_LENGTH = 1_200;

type WebSnippet = {
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string;
  retrievedAt: string;
};

function requestSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]);
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return `${String(response.status)} ${body || response.statusText}`.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function searchWeb(
  query: string,
  config: WebResearchConfig,
  signal: AbortSignal = new AbortController().signal,
): Promise<WebSnippet[]> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(EXA_SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.exaApiKey,
    },
    body: JSON.stringify({
      query,
      numResults: RESULT_COUNT,
      contents: { text: true, maxAgeHours: 24 },
    }),
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    throw new Error(`web_search failed: ${await responseMessage(response)}`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data)) throw new Error("web_search returned invalid data");
  const results = data.results;
  if (results !== undefined && !Array.isArray(results)) {
    throw new Error("web_search returned invalid results");
  }
  const retrievedAt = new Date().toISOString();
  return (results ?? [])
    .filter(isRecord)
    .filter(
      (result) =>
        typeof result.title === "string" && typeof result.url === "string",
    )
    .map((result) => ({
      title: String(result.title),
      url: String(result.url),
      excerpt:
        typeof result.text === "string"
          ? result.text.slice(0, EXCERPT_LENGTH)
          : "",
      ...(typeof result.publishedDate === "string" && {
        publishedAt: result.publishedDate,
      }),
      retrievedAt,
    }));
}

export async function fetchPage(
  url: string,
  config: WebResearchConfig,
  signal: AbortSignal = new AbortController().signal,
): Promise<WebSnippet> {
  if (
    config.firecrawlApiKey === undefined ||
    config.firecrawlApiKey.trim() === ""
  ) {
    throw new Error(
      "fetch_page unavailable: FIRECRAWL_API_KEY is not configured",
    );
  }
  const parsedURL = new URL(url);
  if (parsedURL.protocol !== "https:" && parsedURL.protocol !== "http:") {
    throw new Error("fetch_page requires an http or https URL");
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.firecrawlApiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    throw new Error(`fetch_page failed: ${await responseMessage(response)}`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data)) throw new Error("fetch_page returned invalid data");
  const page = data.data;
  if (page !== undefined && !isRecord(page)) {
    throw new Error("fetch_page returned invalid page data");
  }
  const metadata = page?.metadata;
  if (metadata !== undefined && !isRecord(metadata)) {
    throw new Error("fetch_page returned invalid metadata");
  }
  const publishedAt =
    metadata?.publishedDate ?? metadata?.publishedTime;

  return {
    title:
      typeof metadata?.title === "string" ? metadata.title : url,
    url,
    excerpt:
      typeof page?.markdown === "string"
        ? page.markdown.slice(0, EXCERPT_LENGTH)
        : "",
    ...(typeof publishedAt === "string" && { publishedAt }),
    retrievedAt: new Date().toISOString(),
  };
}

function renderSnippets(snippets: readonly WebSnippet[]): string {
  if (snippets.length === 0) return "No public results found.";
  return snippets
    .map(
      (snippet, index) =>
        `[${String(index + 1)}] ${snippet.title} (${snippet.url})\n` +
        `Published: ${snippet.publishedAt ?? "unknown"}; ` +
        `retrieved: ${snippet.retrievedAt}\n${snippet.excerpt}`,
    )
    .join("\n\n");
}

export function createWebResearchTool(config: WebResearchConfig) {
  return defineTool({
    id: "@corbits/example-slack-fact-check/web-research",
    requires: [],
    factory: (_env: BaseEnv) => ({
      definitions: [
        {
          name: "web_search",
          description:
            "Search the public web for evidence about a claim. Input is " +
            '{"query":"specific search terms"}.',
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
        {
          name: "fetch_page",
          description:
            "Open a public web result when its search excerpt is not enough. " +
            'Input is {"url":"https://..."}.',
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
          },
        },
      ],
      run: async (call, signal) => {
        try {
          if (call.name === "web_search") {
            const query = call.arguments["query"];
            if (typeof query !== "string" || query.trim() === "") {
              throw new Error("web_search requires a non-empty query");
            }
            return {
              callId: call.id,
              content: renderSnippets(await searchWeb(query, config, signal)),
            };
          }
          if (call.name === "fetch_page") {
            const url = call.arguments["url"];
            if (typeof url !== "string" || url.trim() === "") {
              throw new Error("fetch_page requires a URL");
            }
            return {
              callId: call.id,
              content: renderSnippets([await fetchPage(url, config, signal)]),
            };
          }
          return {
            callId: call.id,
            content: `unknown tool: ${call.name}`,
            isError: true,
          };
        } catch (cause) {
          return {
            callId: call.id,
            content: cause instanceof Error ? cause.message : String(cause),
            isError: true,
          };
        }
      },
    }),
  });
}
