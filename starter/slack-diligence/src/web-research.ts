import { defineTool, type BaseEnv } from "@intx/agent";
import { type } from "arktype";

import { ExaSearchResponse, type WebResearchConfig } from "./types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";
const FETCH_TIMEOUT_MS = 30_000;
const RESULT_COUNT = 5;
const EXCERPT_LENGTH = 1_200;

type WebSnippet = {
  title: string;
  url: string;
  excerpt: string;
};

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return `${String(response.status)} ${body || response.statusText}`.trim();
}

export async function searchWeb(
  query: string,
  config: WebResearchConfig,
  signal?: AbortSignal,
): Promise<WebSnippet[]> {
  const response = await (config.fetchImpl ?? fetch)(EXA_SEARCH_URL, {
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

  const raw: unknown = await response.json();
  const data = ExaSearchResponse(raw);
  if (data instanceof type.errors) {
    throw new Error(`web_search response invalid: ${data.summary}`);
  }

  return (data.results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    excerpt: result.text?.slice(0, EXCERPT_LENGTH) ?? "",
  }));
}

export async function fetchPage(
  url: string,
  config: WebResearchConfig,
  signal?: AbortSignal,
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

  const response = await (config.fetchImpl ?? fetch)(FIRECRAWL_SCRAPE_URL, {
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
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("fetch_page returned invalid data");
  }
  const page = (data as { data?: unknown }).data;
  if (page !== undefined && (typeof page !== "object" || page === null)) {
    throw new Error("fetch_page returned invalid page data");
  }
  const record = page as Record<string, unknown> | undefined;
  const metadata = record?.metadata;
  if (
    metadata !== undefined &&
    (typeof metadata !== "object" || metadata === null)
  ) {
    throw new Error("fetch_page returned invalid metadata");
  }
  const meta = metadata as Record<string, unknown> | undefined;

  return {
    title: typeof meta?.title === "string" ? meta.title : url,
    url,
    excerpt:
      typeof record?.markdown === "string"
        ? record.markdown.slice(0, EXCERPT_LENGTH)
        : "",
  };
}

function renderSnippets(snippets: readonly WebSnippet[]): string {
  if (snippets.length === 0) return "No public results found.";
  return snippets
    .map(
      (snippet, index) =>
        `[${String(index + 1)}] ${snippet.title} (${snippet.url})\n${snippet.excerpt}`,
    )
    .join("\n\n");
}

export function createWebResearchTool(config: WebResearchConfig) {
  return defineTool({
    id: "@corbits/example-slack-diligence/web-research",
    requires: [],
    factory: (_env: BaseEnv) => ({
      definitions: [
        {
          name: "web_search",
          description:
            "Search the public web for company diligence evidence. Input is " +
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
            "Open a public web page when a search excerpt is not enough. " +
            "Prefer the company website from the request first. " +
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
