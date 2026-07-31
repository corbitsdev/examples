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
  // Slack includes the bot mention and may append a "Sent using" attribution.
  // Neither belongs in the prompt sent to the agent.
  return text
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]+)?>/g, "")
    .replace(/\*Sent using\*.*$/gim, "")
    .trim();
}

export function truncateForSlack(text: string): string {
  // Slack truncates messages above 40,000 characters, so stay below that limit.
  const limit = 39_000;
  if (text.length <= limit) return text;

  const notice = "\n\n[Response truncated to fit Slack's message limit.]";
  return text.slice(0, limit - notice.length) + notice;
}
