import type {
  GrillDecision,
  GrillQuestion,
  GrillReport,
  OptionId,
} from "./types";
import { Actions, Button, Card, CardText, type CardElement } from "chat";

export const SELECT_OPTION_ACTION_IDS = [
  "team-grill.select-a",
  "team-grill.select-b",
  "team-grill.select-c",
] as const;

const ACTION_ID_BY_OPTION: Record<
  OptionId,
  (typeof SELECT_OPTION_ACTION_IDS)[number]
> = {
  a: SELECT_OPTION_ACTION_IDS[0],
  b: SELECT_OPTION_ACTION_IDS[1],
  c: SELECT_OPTION_ACTION_IDS[2],
};

const CARD_TEXT_LIMIT = 2_900;
const BUTTON_LABEL_LIMIT = 65;

export function actionIdFor(
  optionId: OptionId,
): (typeof SELECT_OPTION_ACTION_IDS)[number] {
  return ACTION_ID_BY_OPTION[optionId];
}

export function questionCard(
  question: GrillQuestion,
  valueFor: (optionId: OptionId) => string,
  runId: string,
): CardElement {
  const options = question.options
    .map((option) => {
      const recommendation =
        option.id === question.recommendedOptionId ? " · Recommended" : "";
      return `${option.id.toUpperCase()}. ${safe(option.title)}${recommendation}\n${safe(option.detail)}`;
    })
    .join("\n\n");

  return Card({
    title: `Question ${String(question.round)}`,
    children: [
      CardText(
        truncate(
          `${safe(question.question)}\n${safe(question.context)}\n\n${options}\n\nInterchange run: ${safe(runId)}`,
          CARD_TEXT_LIMIT,
        ),
      ),
      Actions(
        question.options.map((option) =>
          Button({
            id: actionIdFor(option.id),
            label: buttonLabel(option.id, option.title),
            value: valueFor(option.id),
            ...(option.id === question.recommendedOptionId
              ? { style: "primary" as const }
              : {}),
          }),
        ),
      ),
    ],
  });
}

export function lockedQuestionCard(
  question: GrillQuestion,
  decision: GrillDecision,
): CardElement {
  return Card({
    title: `Question ${String(question.round)} · Finalized`,
    children: [
      CardText(
        truncate(
          [
            safe(question.question),
            "",
            `Selected: ${decision.selectedOptionId.toUpperCase()}. ${safe(decision.selectedOptionTitle)}`,
            `Finalized by ${safe(decision.finalizedBy)}`,
          ].join("\n"),
          CARD_TEXT_LIMIT,
        ),
      ),
    ],
  });
}

export function completedCard(
  report: GrillReport,
  decisions: GrillDecision[],
  runId: string,
): CardElement {
  return Card({
    title: "Grill complete",
    children: [CardText(reportBodyText(report, decisions, runId))],
  });
}

export function alreadyRunningCard(): CardElement {
  return Card({
    title: "Team Grill already running",
    children: [CardText("Finalize the current question first.")],
  });
}

export function failedCard(runId: string, message: string): CardElement {
  return Card({
    title: "Team Grill stopped",
    children: [
      CardText(
        truncate(
          `${safe(message)}\n\nInterchange run: ${safe(runId)}`,
          CARD_TEXT_LIMIT,
        ),
      ),
    ],
  });
}

export function finalReportText(
  report: GrillReport,
  decisions: GrillDecision[],
  runId: string,
): string {
  return truncate(
    `Grill complete\n\n${reportBodyText(report, decisions, runId)}`,
    CARD_TEXT_LIMIT,
  );
}

function reportBodyText(
  report: GrillReport,
  decisions: GrillDecision[],
  runId: string,
): string {
  const decisionLines =
    decisions.length === 0
      ? "None."
      : decisions
          .map(
            (decision) =>
              `${String(decision.round)}. ${safe(decision.question)}\n→ ${decision.selectedOptionId.toUpperCase()}. ${safe(decision.selectedOptionTitle)}`,
          )
          .join("\n\n");
  const openItems =
    report.openItems.length === 0
      ? "None."
      : report.openItems.map((item) => `• ${safe(item)}`).join("\n");

  return truncate(
    [
      "Conclusion",
      safe(report.conclusion),
      "",
      "Final decisions",
      decisionLines,
      "",
      "Still open",
      openItems,
      "",
      `Interchange run: ${safe(runId)}`,
    ].join("\n"),
    CARD_TEXT_LIMIT,
  );
}

function buttonLabel(optionId: OptionId, title: string): string {
  return truncate(
    `${optionId.toUpperCase()} · ${safe(title)}`,
    BUTTON_LABEL_LIMIT,
  );
}

function safe(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
