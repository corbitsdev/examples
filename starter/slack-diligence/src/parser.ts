import { type } from "arktype";

import {
  DiligenceBriefBody,
  type DiligenceBrief,
  type DiligenceRequest,
} from "./types";

export type ParseDiligenceResult =
  | { ok: true; brief: DiligenceBrief }
  | { ok: false; error: string };

function parseJSON(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
}

function normalizeBrief(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  const claims = Array.isArray(record.claims) ? record.claims : [];
  const byId = new Map(
    claims.flatMap((claim) =>
      typeof claim === "object" && claim !== null && typeof (claim as { id?: unknown }).id === "string"
        ? [[(claim as { id: string }).id, claim] as const]
        : [],
    ),
  );
  const resolveClaims = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) => (typeof item === "string" ? byId.get(item) ?? item : item))
      : items;
  const sections = Array.isArray(record.sections)
    ? record.sections.map((section) => {
        if (typeof section !== "object" || section === null) return section;
        const value = section as Record<string, unknown>;
        const normalized: Record<string, unknown> = {
          ...value,
          claims: resolveClaims(value.claims),
        };
        if (Array.isArray(value.subsections)) {
          normalized.subsections = value.subsections.map((subsection) =>
            typeof subsection === "object" && subsection !== null
              ? {
                  ...subsection,
                  claims: resolveClaims(
                    (subsection as Record<string, unknown>).claims,
                  ),
                }
              : subsection,
          );
        } else {
          delete normalized.subsections;
        }
        return normalized;
      })
    : record.sections;

  return { ...record, sections };
}

export function parseDiligenceBrief(
  input: unknown,
  request: DiligenceRequest,
): ParseDiligenceResult {
  let value: unknown;
  try {
    const reply =
      typeof input === "object" && input !== null && "reply" in input
        ? (input as { reply?: unknown }).reply
        : input;
    value = typeof reply === "string" ? parseJSON(reply) : reply;
  } catch {
    return { ok: false, error: "Diligence brief output is not valid JSON" };
  }

  const body = DiligenceBriefBody(normalizeBrief(value));
  if (body instanceof type.errors) {
    return { ok: false, error: `Diligence brief output invalid: ${body.summary}` };
  }

  return {
    ok: true,
    brief: {
      ...body,
      ...request,
      verdict: body.verdict ?? "Diligence review",
      rationale:
        body.rationale ??
        "Evidence-led review for the next diligence decision.",
    },
  };
}
