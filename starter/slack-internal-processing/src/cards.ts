import { Card, CardText, type CardElement } from "chat";

import type { CallDigestResult } from "./types";

const MAX_CARD_TITLE_LENGTH = 150;
const MAX_CARD_BODY_LENGTH = 2_700;

export function callDigestIntakeCard(): CardElement {
  return Card({
    title: "Call digest ready",
    children: [
      CardText(
        "*Next step*\nUpload the full call transcript as a `.txt` file in this thread. The bot will turn it into a concise digest, named companies, and follow-up claims.",
      ),
      CardText(
        "_The filename becomes the call title. Long transcripts are welcome._",
      ),
    ],
  });
}

export function statusCard(title: string, text: string): CardElement {
  return Card({
    title: clampTitle(title),
    children: [CardText(escapeGeneratedMrkdwn(truncateBody(text)))],
  });
}

export function callDigestCards(digest: CallDigestResult): CardElement[] {
  return [
    ...sectionCards(`Call digest: ${escapeGeneratedMrkdwn(digest.callTitle)}`, "Summary", [
      escapeGeneratedMrkdwn(digest.summary),
    ]),
    ...sectionCards(
      "Key discussion points",
      "Key discussion points",
      digest.discussionPoints.length === 0
        ? ["None identified."]
        : digest.discussionPoints.map(
            (point) => `• ${escapeGeneratedMrkdwn(point)}`,
          ),
    ),
    ...sectionCards(
      "Companies mentioned",
      "Companies mentioned",
      digest.companies.length === 0
        ? ["None identified."]
        : digest.companies.map((company) => {
            const website =
              company.website === undefined
                ? ""
                : ` — ${escapeGeneratedMrkdwn(company.website)}`;
            return `• *${escapeGeneratedMrkdwn(company.name)}*${website}\n${escapeGeneratedMrkdwn(company.context)}`;
          }),
    ),
    ...sectionCards(
      "Claims to follow up",
      "Claims to follow up",
      digest.claims.length === 0
        ? ["None identified."]
        : digest.claims.map((claim) => {
            const subject =
              claim.subjectCompany === undefined
                ? ""
                : ` — *${escapeGeneratedMrkdwn(claim.subjectCompany)}*`;
            return `• ${escapeGeneratedMrkdwn(claim.text)}${subject}`;
          }),
    ),
  ];
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

function sectionCards(
  title: string,
  heading: string,
  items: string[],
): CardElement[] {
  const chunks = chunkItems(items);
  return chunks.map((chunk, index) => {
    const page = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return Card({
      title: clampTitle(`${title}${page}`),
      children: [CardText(`*${heading}*\n${chunk}`)],
    });
  });
}

function escapeGeneratedMrkdwn(text: string): string {
  // CardText parses GFM before the Slack adapter renders it. Escape model text
  // at the leaf so intentional *bold* wrappers around company names still work.
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("~", "\\~")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_");
}

function chunkItems(items: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const item of items) {
    for (const part of splitLongItem(item)) {
      const next = current === "" ? part : `${current}\n\n${part}`;
      if (next.length > MAX_CARD_BODY_LENGTH && current !== "") {
        chunks.push(current);
        current = part;
      } else {
        current = next;
      }
    }
  }

  if (current !== "") chunks.push(current);
  return chunks;
}

function splitLongItem(item: string): string[] {
  const parts: string[] = [];
  let remaining = item;

  while (remaining.length > MAX_CARD_BODY_LENGTH) {
    const boundary = remaining.lastIndexOf(" ", MAX_CARD_BODY_LENGTH);
    const end = boundary > 0 ? boundary : MAX_CARD_BODY_LENGTH;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  parts.push(remaining);
  return parts;
}
