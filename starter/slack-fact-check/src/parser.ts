import type {
  FactCheckClaim,
  FactCheckReport,
  FactCheckSource,
  FactCheckVerdict,
} from "./types";

export type ParseFactCheckResult =
  | { ok: true; report: FactCheckReport }
  | { ok: false; error: string };

const VERDICTS = new Set<FactCheckVerdict>([
  "confirmed",
  "contradicted",
  "unverifiable",
]);

function record(value: unknown): Record<string, unknown> | undefined {
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
  const stripped = stripFence(text);
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return undefined;
  }
}

function parseSources(value: unknown): FactCheckSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: FactCheckSource[] = [];
  for (const entry of value) {
    const item = record(entry);
    const title = nonEmptyString(item?.["title"]);
    if (title === undefined) return undefined;
    const url = nonEmptyString(item?.["url"]);
    sources.push({ title, ...(url !== undefined && { url }) });
  }
  return sources;
}

function parseClaim(value: unknown): FactCheckClaim | undefined {
  const item = record(value);
  if (item === undefined) return undefined;
  const id = nonEmptyString(item["id"]);
  const claim = nonEmptyString(item["claim"]);
  const rawVerdict = nonEmptyString(item["verdict"])?.toLowerCase();
  if (
    id === undefined ||
    claim === undefined ||
    rawVerdict === undefined ||
    !VERDICTS.has(rawVerdict as FactCheckVerdict)
  ) {
    return undefined;
  }

  const verdict = rawVerdict as FactCheckVerdict;
  const sources = parseSources(item["sources"]);
  if (sources === undefined) return undefined;
  if (verdict !== "unverifiable" && sources.length === 0) return undefined;

  const explanation = nonEmptyString(item["explanation"]);
  const rawConfidence = nonEmptyString(item["confidence"])?.toLowerCase();
  const confidence =
    rawConfidence === "high" ||
    rawConfidence === "medium" ||
    rawConfidence === "low"
      ? rawConfidence
      : undefined;

  return {
    id,
    claim,
    verdict,
    ...(explanation !== undefined && { explanation }),
    ...(confidence !== undefined && { confidence }),
    sources,
  };
}

export function parseFactCheckReport(input: unknown): ParseFactCheckResult {
  const value = typeof input === "string" ? parseJSON(input) : input;
  const item = record(value);
  if (item === undefined) {
    return { ok: false, error: "fact-check output is not a JSON object" };
  }

  const subject = nonEmptyString(item["subject"]);
  const summary = nonEmptyString(item["summary"]);
  if (subject === undefined || summary === undefined) {
    return { ok: false, error: "fact-check output needs subject and summary" };
  }
  if (!Array.isArray(item["claims"]) || item["claims"].length === 0) {
    return { ok: false, error: "fact-check output has no claims array" };
  }

  const claims: FactCheckClaim[] = [];
  for (const [index, value] of item["claims"].entries()) {
    const claim = parseClaim(value);
    if (claim === undefined) {
      return {
        ok: false,
        error: `fact-check claim ${String(index + 1)} is invalid or unsourced`,
      };
    }
    claims.push(claim);
  }

  return {
    ok: true,
    report: {
      subject,
      summary,
      claims,
    },
  };
}
