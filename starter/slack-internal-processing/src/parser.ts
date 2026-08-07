import type {
  CallDigestClaim,
  CallDigestCompany,
  CallDigestResult,
} from "./types";

export type ParseCallDigestResult =
  | { ok: true; digest: CallDigestResult }
  | { ok: false; error: string };

function plainObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(stripFence(text)) as unknown;
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(nonEmptyString);
  return items.every((item) => item !== undefined)
    ? (items as string[])
    : undefined;
}

function company(value: unknown): CallDigestCompany | undefined {
  const item = plainObject(value);
  if (item === undefined) return undefined;
  const name = nonEmptyString(item.name);
  const context = nonEmptyString(item.context);
  if (name === undefined || context === undefined) return undefined;
  const website = nonEmptyString(item.website);
  return { name, context, ...(website !== undefined && { website }) };
}

function claim(value: unknown): CallDigestClaim | undefined {
  const item = plainObject(value);
  if (item === undefined) return undefined;
  const text = nonEmptyString(item.text);
  if (text === undefined) return undefined;
  const subjectCompany = nonEmptyString(item.subjectCompany);
  return { text, ...(subjectCompany !== undefined && { subjectCompany }) };
}

export function parseCallDigest(input: unknown): ParseCallDigestResult {
  const item = plainObject(typeof input === "string" ? parseJSON(input) : input);
  if (item === undefined) {
    return { ok: false, error: "call digest output is not a JSON object" };
  }

  const callTitle = nonEmptyString(item.callTitle);
  const summary = nonEmptyString(item.summary);
  const discussionPoints = stringArray(item.discussionPoints);
  if (
    callTitle === undefined ||
    summary === undefined ||
    discussionPoints === undefined
  ) {
    return {
      ok: false,
      error: "call digest needs a title, summary, and discussion points",
    };
  }
  if (!Array.isArray(item.companies) || !Array.isArray(item.claims)) {
    return {
      ok: false,
      error: "call digest needs companies and claims arrays",
    };
  }

  const companies = item.companies.map(company);
  if (companies.some((entry) => entry === undefined)) {
    return { ok: false, error: "call digest contains an invalid company" };
  }
  const claims = item.claims.map(claim);
  if (claims.some((entry) => entry === undefined)) {
    return { ok: false, error: "call digest contains an invalid claim" };
  }

  return {
    ok: true,
    digest: {
      callTitle,
      summary,
      discussionPoints,
      companies: companies as CallDigestCompany[],
      claims: claims as CallDigestClaim[],
    },
  };
}
