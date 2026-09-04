import { type } from "arktype";

export type Source = {
  id: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  defaults: { maxTokens: number };
};

export type ResolveSourceResult =
  | { source: Source; error?: undefined }
  | { source?: undefined; error: string };

export type DiligenceRequest = {
  company: string;
  website: string;
  asOf: string;
};

export const SourceRef = type({
  id: "string > 0",
  title: "string > 0",
  "url?": "string > 0",
});
export type SourceRef = typeof SourceRef.infer;

export const Claim = type({
  id: "string > 0",
  text: "string > 0",
  sources: SourceRef.array(),
});
export type Claim = typeof Claim.infer;

export const BriefSubsection = type({
  id: "string > 0",
  title: "string > 0",
  body: "string",
  claims: Claim.array(),
});
export type BriefSubsection = typeof BriefSubsection.infer;

export const BriefSection = type({
  id: "string > 0",
  title: "string > 0",
  body: "string",
  claims: Claim.array(),
  "subsections?": BriefSubsection.array(),
});
export type BriefSection = typeof BriefSection.infer;

export const DiligenceBriefBody = type({
  dealName: "string > 0",
  summary: "string > 0",
  claims: Claim.array(),
  sections: BriefSection.array(),
  "rationale?": "string > 0",
  "verdict?": "string > 0",
  "risks?": "string[]",
  "nextAction?": "string > 0",
  "questions?": "string[]",
});
export type DiligenceBriefBody = typeof DiligenceBriefBody.infer;

export type DiligenceBrief = Omit<
  DiligenceBriefBody,
  "verdict" | "rationale"
> &
  DiligenceRequest & {
    verdict: string;
    rationale: string;
  };

export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type WebResearchConfig = {
  exaApiKey: string;
  firecrawlApiKey?: string;
  fetchImpl?: FetchImpl;
};

export const ExaSearchResponse = type({
  "results?": type({
    title: "string",
    url: "string",
    "text?": "string",
  }).array(),
});
export type ExaSearchResponse = typeof ExaSearchResponse.infer;
