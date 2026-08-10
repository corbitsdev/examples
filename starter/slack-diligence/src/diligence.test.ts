import { describe, expect, test } from "bun:test";

import { parseDiligenceBrief } from "./parser";
import { parseDiligenceInput } from "./request";
import type { DiligenceRequest, FetchImpl } from "./types";
import { searchWeb } from "./web-research";

const request: DiligenceRequest = {
  company: "Acme",
  website: "https://acme.example",
  asOf: "2026-08-07T12:00:00.000Z",
};

function minimalBrief(overrides: Record<string, unknown> = {}) {
  return {
    dealName: "Acme",
    summary: "Early-stage company with limited disclosed metrics.",
    claims: [
      {
        id: "c1",
        text: "Acme is a YC company.",
        sources: [
          {
            id: "s1",
            title: "YC",
            url: "https://ycombinator.com/companies/acme",
          },
        ],
      },
    ],
    sections: [
      {
        id: "team",
        title: "Team & Founders",
        body: "Insufficient evidence on founders.",
        claims: ["c1"],
      },
    ],
    verdict: "Watch",
    ...overrides,
  };
}

describe("parseDiligenceInput", () => {
  test("plain Company | URL works", () => {
    expect(parseDiligenceInput("Acme | https://acme.example")).toEqual({
      company: "Acme",
      website: "https://acme.example",
    });
  });

  test("strips Slack angle-bracket URLs from company", () => {
    expect(parseDiligenceInput("Acme <https://acme.example>")).toEqual({
      company: "Acme",
      website: "https://acme.example",
    });
  });

  test("strips Slack labeled URLs from company", () => {
    expect(
      parseDiligenceInput("Acme <https://acme.example|acme.example>"),
    ).toEqual({
      company: "Acme",
      website: "https://acme.example",
    });
  });
});

describe("parseDiligenceBrief", () => {
  test("accepts omitted subsections", () => {
    const result = parseDiligenceBrief(JSON.stringify(minimalBrief()), request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.brief.company).toBe("Acme");
      expect(result.brief.verdict).toBe("Watch");
      expect(result.brief.rationale.length).toBeGreaterThan(0);
      expect(result.brief.sections[0]?.claims[0]?.id).toBe("c1");
      expect(result.brief.sections[0]?.subsections).toBeUndefined();
    }
  });

  test("accepts string and fenced draft output", () => {
    const brief = minimalBrief();
    expect(parseDiligenceBrief(JSON.stringify(brief), request).ok).toBe(true);
    expect(
      parseDiligenceBrief(`\`\`\`json\n${JSON.stringify(brief)}\n\`\`\``, request)
        .ok,
    ).toBe(true);
  });

  test("fills missing verdict and rationale at the parse edge", () => {
    const { verdict: _verdict, ...withoutVerdict } = minimalBrief() as {
      verdict?: string;
      [key: string]: unknown;
    };
    void _verdict;
    const result = parseDiligenceBrief(
      JSON.stringify(withoutVerdict),
      request,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.brief.verdict).toBe("Diligence review");
      expect(result.brief.rationale).toContain("Evidence-led");
    }
  });
});

describe("searchWeb timeouts", () => {
  test("aborts a hung Exa fetch when the signal times out", async () => {
    const fetchImpl: FetchImpl = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });

    await expect(
      searchWeb("acme", { exaApiKey: "k", fetchImpl }, AbortSignal.timeout(20)),
    ).rejects.toThrow();
  });
});
