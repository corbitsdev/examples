import { Actions, Button, Card, CardText, type CardElement } from "chat";

export const APPROVE_ACTION_ID = "approval.approve";
export const REJECT_ACTION_ID = "approval.reject";
export const APPROVAL_ACTION_IDS = [
  APPROVE_ACTION_ID,
  REJECT_ACTION_ID,
] as const;

export function approvalCard(draft: string, runId: string): CardElement {
  return Card({
    title: "Draft ready for approval",
    children: [
      CardText(truncate(draft)),
      Actions([
        Button({
          label: "Approve",
          style: "primary",
          id: APPROVE_ACTION_ID,
          value: runId,
        }),
        Button({
          label: "Reject",
          style: "danger",
          id: REJECT_ACTION_ID,
          value: runId,
        }),
      ]),
    ],
  });
}

export function statusCard(title: string, text: string): CardElement {
  return Card({ title, children: [CardText(truncate(text))] });
}

function truncate(text: string): string {
  return text.length > 2900 ? text.slice(0, 2897) + "..." : text;
}
