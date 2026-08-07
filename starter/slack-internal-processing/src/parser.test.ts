import { describe, expect, test } from "bun:test";

import { parseCallDigest } from "./parser";

describe("parseCallDigest", () => {
  test("accepts a valid digest object", () => {
    const result = parseCallDigest({
      callTitle: "Acme Call",
      summary: "Discussed runway.",
      discussionPoints: ["Runway is 12 months"],
      companies: [{ name: "Acme", context: "Customer", website: "https://acme.example" }],
      claims: [{ text: "ARR is $1M", subjectCompany: "Acme" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.digest.companies[0]?.website).toBe("https://acme.example");
      expect(result.digest.claims[0]?.subjectCompany).toBe("Acme");
    }
  });

  test("strips json fenced model output", () => {
    const body = JSON.stringify({
      callTitle: "JSON Fence",
      summary: "ok",
      discussionPoints: ["a"],
      companies: [],
      claims: [],
    });
    const result = parseCallDigest("```json\n" + body + "\n```");
    expect(result.ok).toBe(true);
  });

  test("allows empty companies and claims arrays", () => {
    const result = parseCallDigest({
      callTitle: "Empty",
      summary: "Nothing much",
      discussionPoints: ["quiet call"],
      companies: [],
      claims: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.digest.companies).toEqual([]);
      expect(result.digest.claims).toEqual([]);
    }
  });

  test("rejects company without context", () => {
    const result = parseCallDigest({
      callTitle: "Bad company",
      summary: "x",
      discussionPoints: ["a"],
      companies: [{ name: "Acme" }],
      claims: [],
    });
    expect(result.ok).toBe(false);
  });

  test("rejects claim without text", () => {
    const result = parseCallDigest({
      callTitle: "Bad claim",
      summary: "x",
      discussionPoints: ["a"],
      companies: [],
      claims: [{ subjectCompany: "Acme" }],
    });
    expect(result.ok).toBe(false);
  });
});
