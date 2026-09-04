import type { DiligenceBrief } from "./types";

const MAX_CARD_TITLE_LENGTH = 150;
const MAX_CARD_BODY_LENGTH = 2_700;

export function statusCard(title: string, text: string): string {
  return `*${clampTitle(title)}*\n\n${escapeGeneratedMrkdwn(truncateBody(text))}`;
}

export function diligenceCard(
  brief: DiligenceBrief,
  opts: { pdfAttached: boolean },
): string {
  const lines = [
    escapeGeneratedMrkdwn(brief.verdict),
    ...(brief.nextAction === undefined
      ? []
      : [`*Next action:* ${escapeGeneratedMrkdwn(brief.nextAction)}`]),
    ...(brief.risks?.[0] === undefined
      ? []
      : [`*Top risk:* ${escapeGeneratedMrkdwn(brief.risks[0])}`]),
    ...(opts.pdfAttached
      ? ["Full sourced brief attached as PDF."]
      : ["PDF delivery failed; Slack snapshot only."]),
  ];

  return [
    `*${clampTitle(escapeGeneratedMrkdwn(brief.company))}*`,
    `_Diligence brief · ${escapeGeneratedMrkdwn(brief.asOf.slice(0, 10))}_`,
    "",
    truncateBody(lines.join("\n")),
  ].join("\n");
}

function clampTitle(text: string): string {
  return text.length > MAX_CARD_TITLE_LENGTH
    ? `${text.slice(0, MAX_CARD_TITLE_LENGTH - 1)}…`
    : text;
}

function truncateBody(text: string): string {
  return text.length > MAX_CARD_BODY_LENGTH
    ? `${text.slice(0, MAX_CARD_BODY_LENGTH - 1)}…`
    : text;
}

function escapeGeneratedMrkdwn(text: string): string {
  // TagThread posts these strings as Slack mrkdwn. Escape model text at the
  // leaf so intentional *bold* wrappers around labels still work.
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("~", "\\~")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_");
}
