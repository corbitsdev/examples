export type Source = {
  id: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
};

export type ResolveSourceResult =
  | { source: Source; error?: undefined }
  | { source?: undefined; error: string };

export type FactCheckVerdict =
  | "confirmed"
  | "contradicted"
  | "unverifiable";

export type FactCheckSource = {
  title: string;
  url?: string;
};

export type FactCheckClaim = {
  id: string;
  claim: string;
  verdict: FactCheckVerdict;
  explanation?: string;
  confidence?: "high" | "medium" | "low";
  sources: FactCheckSource[];
};

export type FactCheckReport = {
  subject: string;
  summary: string;
  claims: FactCheckClaim[];
};

export type WebResearchConfig = {
  exaApiKey: string;
  firecrawlApiKey?: string;
};
