import { Card, CardText, type CardElement } from "chat";

import type { FactCheckReport } from "./types";

const MAX_TEXT_LENGTH = 2_900;

export function statusCard(title: string, text: string): CardElement {
  return Card({ title, children: [CardText(truncate(text))] });
}

export function factCheckCard(report: FactCheckReport): CardElement {
  const lines = [report.summary, ""];
  for (const claim of report.claims) {
    lines.push(`[${claim.verdict.toUpperCase()}] ${claim.claim}`);
    if (claim.explanation !== undefined) lines.push(claim.explanation);
    for (const source of claim.sources) {
      lines.push(
        source.url === undefined
          ? `Source: ${source.title}`
          : `Source: <${source.url}|${source.title}>`,
      );
    }
    lines.push("");
  }

  return Card({
    title: `Fact check: ${report.subject}`,
    children: [CardText(truncate(lines.join("\n").trim()))],
  });
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH - 3)}...`
    : text;
}
