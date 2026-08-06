import { Actions, Button, Card, CardText, type CardElement } from "chat";

import type { ValidatedPost } from "./post";
import type { PostReceipt } from "./x-client";

export const APPROVE_ACTION_ID = "post-to-x.approve";
export const REJECT_ACTION_ID = "post-to-x.reject";
export const APPROVAL_ACTION_IDS = [
  APPROVE_ACTION_ID,
  REJECT_ACTION_ID,
] as const;

export function startedCard(runId: string): CardElement {
  return statusCard(
    "Post-to-X workflow started",
    `Run \`${runId}\` is drafting.`,
  );
}

export function approvalCard(
  post: ValidatedPost,
  approvalId: string,
): CardElement {
  return Card({
    title: "Post ready for approval",
    children: [
      CardText(truncate(post.text)),
      CardText(
        `${String(post.characterCount)}/${String(post.limit)} local characters; X applies final validation`,
      ),
      Actions([
        Button({
          label: "Approve",
          style: "primary",
          id: APPROVE_ACTION_ID,
          value: approvalId,
        }),
        Button({
          label: "Reject",
          style: "danger",
          id: REJECT_ACTION_ID,
          value: approvalId,
        }),
      ]),
    ],
  });
}

export function receiptCard(receipt: PostReceipt): CardElement {
  const title = receipt.mode === "live" ? "Posted to X" : "Dry run complete";
  const detail =
    receipt.mode === "live"
      ? `${receipt.url}\n\n${receipt.text}`
      : `No X post was created.\n\n${receipt.text}\n\nReceipt: ${receipt.postId}`;
  return statusCard(title, detail);
}

export function statusCard(title: string, text: string): CardElement {
  return Card({ title, children: [CardText(truncate(text))] });
}

function truncate(text: string): string {
  return text.length > 2900 ? text.slice(0, 2897) + "..." : text;
}
