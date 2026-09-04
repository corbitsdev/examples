import { describe, expect, test } from "bun:test";

import { diligenceCard, statusCard } from "./cards";
import type { DiligenceBrief } from "./types";

const brief: DiligenceBrief = {
  dealName: "Star*Corp",
  company: "Star*Corp",
  website: "https://star.example",
  asOf: "2026-08-07T12:00:00.000Z",
  summary: "Limited evidence.",
  rationale: "Needs review.",
  verdict: "Watch ~draft~ with *emphasis*",
  nextAction: "Call the founder_now",
  risks: ["Spend was ~$420K"],
  claims: [],
  sections: [],
};

describe("diligence cards", () => {
  test("status card is Slack mrkdwn, not a Chat Card element", () => {
    const card = statusCard("Diligence started", "Run `abc` is researching.");
    expect(typeof card).toBe("string");
    expect(card).toContain("*Diligence started*");
    expect(card).toContain("Run `abc` is researching.");
    expect(card).not.toContain("children");
  });

  test("escapes model markdown while keeping intentional bold wrappers", () => {
    const card = diligenceCard(brief, { pdfAttached: true });
    expect(typeof card).toBe("string");
    expect(card).toContain("*Star\\*Corp*");
    expect(card).toContain("_Diligence brief · 2026-08-07_");
    expect(card).toContain("Watch \\~draft\\~ with \\*emphasis\\*");
    expect(card).toContain("*Next action:* Call the founder\\_now");
    expect(card).toContain("*Top risk:* Spend was \\~$420K");
    expect(card).toContain("Full sourced brief attached as PDF.");
  });

  test("notes PDF delivery failure in the snapshot", () => {
    const card = diligenceCard(brief, { pdfAttached: false });
    expect(card).toContain("PDF delivery failed; Slack snapshot only.");
  });
});
