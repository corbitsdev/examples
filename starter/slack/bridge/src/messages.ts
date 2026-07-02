import { WebClient } from "@slack/web-api";

import type { SlackBlock } from "./blocks";

export type SlackPostMessage = {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: SlackBlock[];
};

export async function postMessage(
  botToken: string,
  message: SlackPostMessage,
): Promise<{ channel: string; ts: string }> {
  const client = new WebClient(botToken);
  const result = await client.chat.postMessage(message);

  if (result.channel === undefined || result.ts === undefined) {
    throw new Error(
      `Slack chat.postMessage failed: ${result.error ?? "unknown error"}`,
    );
  }

  return { channel: result.channel, ts: result.ts };
}

export function cleanSlackText(text: string): string {
  return text
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]+)?>/g, "")
    .replace(/\*Sent using\*.*$/gim, "")
    .trim();
}

export function truncateForSlack(text: string): string {
  return text.length > 39000 ? text.slice(0, 38997) + "..." : text;
}
