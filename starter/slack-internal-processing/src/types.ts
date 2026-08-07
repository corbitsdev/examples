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

export type CallDigestInput = {
  callTitle: string;
  transcript: string;
};

export type CallDigestCompany = {
  name: string;
  website?: string;
  context: string;
};

export type CallDigestClaim = {
  text: string;
  subjectCompany?: string;
};

export type CallDigestResult = {
  callTitle: string;
  summary: string;
  discussionPoints: string[];
  companies: CallDigestCompany[];
  claims: CallDigestClaim[];
};
