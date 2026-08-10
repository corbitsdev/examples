import { Card, CardText, type CardElement } from "chat";

import type { DiligenceBrief } from "./types";

const MAX_TEXT_LENGTH = 2_900;

export function statusCard(title: string, text: string): CardElement {
  return Card({ title, children: [CardText(truncate(text))] });
}

export function diligenceCard(
  brief: DiligenceBrief,
  opts: { pdfAttached: boolean },
): CardElement {
  const lines = [
    brief.verdict,
    ...(brief.nextAction === undefined
      ? []
      : [`*Next action:* ${brief.nextAction}`]),
    ...(brief.risks?.[0] === undefined
      ? []
      : [`*Top risk:* ${brief.risks[0]}`]),
    ...(opts.pdfAttached
      ? ["Full sourced brief attached as PDF."]
      : ["PDF delivery failed; Slack snapshot only."]),
  ];

  return Card({
    title: brief.company,
    subtitle: `Diligence brief · ${brief.asOf.slice(0, 10)}`,
    children: [CardText(truncate(lines.join("\n")))],
  });
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH - 3)}...`
    : text;
}
