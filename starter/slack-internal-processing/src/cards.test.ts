import { describe, expect, test } from "bun:test";

import { callDigestCards, callDigestIntakeCard } from "./cards";
import type { CallDigestResult } from "./types";

describe("call digest cards", () => {
  test("intake card does not mention Scout", () => {
    expect(JSON.stringify(callDigestIntakeCard())).not.toContain("Scout");
  });

  test("escapes model markdown while keeping intentional bold wrappers", () => {
    const digest: CallDigestResult = {
      callTitle: "Numbers_~draft~",
      summary: "Spend was ~$420K last quarter.",
      discussionPoints: [],
      companies: [{ name: "Star*Corp", context: "Vendor with *emphasis*" }],
      claims: [],
    };
    const blob = JSON.stringify(callDigestCards(digest));
    expect(blob).toContain("\\\\~$420K");
    expect(blob).toContain("*Star\\\\*Corp*");
    expect(blob).toContain("Vendor with \\\\*emphasis\\\\*");
    expect(blob).toContain("Numbers\\\\_\\\\~draft\\\\~");
  });

  test("chunks oversized sections across multiple cards", () => {
    const longPoint = "p".repeat(2_000);
    const digest: CallDigestResult = {
      callTitle: "Long",
      summary: "s",
      discussionPoints: [longPoint, longPoint],
      companies: [],
      claims: [],
    };
    const discussionCards = callDigestCards(digest).filter((card) =>
      JSON.stringify(card).includes("Key discussion points"),
    );
    expect(discussionCards.length).toBeGreaterThan(1);
  });
});
