import type { FilesUploadV2Arguments } from "@slack/web-api";

import type { DiligenceBrief } from "./types";

export type SlackFileClient = {
  filesUploadV2(options: FilesUploadV2Arguments): Promise<unknown>;
};

export function uploadDiligencePdf(
  slack: SlackFileClient,
  threadId: string,
  brief: DiligenceBrief,
  pdf: Buffer,
): Promise<unknown> {
  const parts = threadId.split(":");
  const threadTs = parts.pop();
  const channelId = parts.pop();
  if (channelId === undefined || threadTs === undefined) {
    throw new Error(`Invalid Slack thread id: ${threadId}`);
  }

  const slug = brief.company
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

  return slack.filesUploadV2({
    channel_id: channelId,
    thread_ts: threadTs,
    file: pdf,
    filename: `${slug}-diligence.pdf`,
    title: `${brief.company} diligence brief`,
    initial_comment: "Downloadable sourced diligence brief",
  });
}
