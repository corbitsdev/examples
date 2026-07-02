import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent, GenericMessageEvent } from "@slack/types";

import { cleanSlackText } from "./messages";

export type SlackEvent = AppMentionEvent | GenericMessageEvent;

export type SlashCommand = SlackCommandMiddlewareArgs["command"];

export type SlackAssistantThread = {
  teamId?: string;
  channel: string;
  threadTs: string;
  userId?: string;
};

export type SlackAssistantMessage = SlackAssistantThread & {
  prompt: string;
};

export type SlackBlockAction = {
  actionId: string;
  value?: string;
  teamId?: string;
  userId?: string;
  channelId?: string;
  messageTs?: string;
};

export function toSlackBlockAction(
  contextTeamId: string | undefined,
  body: unknown,
  action: unknown,
): SlackBlockAction {
  const actionRecord = asRecord(action);
  const bodyRecord = asRecord(body);
  const user = asRecord(bodyRecord.user);
  const channel = asRecord(bodyRecord.channel);
  const message = asRecord(bodyRecord.message);
  const container = asRecord(bodyRecord.container);
  const team = asRecord(bodyRecord.team);

  return {
    actionId: stringValue(actionRecord.action_id) ?? "",
    value: stringValue(actionRecord.value),
    teamId: stringValue(team.id) ?? contextTeamId,
    userId: stringValue(user.id),
    channelId: stringValue(channel.id),
    messageTs: stringValue(message.ts) ?? stringValue(container.message_ts),
  };
}

export function toSlackAssistantThread(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantThread | undefined {
  const payloadRecord = asRecord(payload);
  const assistantThread = asRecord(payloadRecord.assistant_thread);
  const context = asRecord(assistantThread.context);
  const channel = stringValue(assistantThread.channel_id);
  const threadTs = stringValue(assistantThread.thread_ts);
  if (channel === undefined || threadTs === undefined) return undefined;

  return {
    teamId: stringValue(context.team_id) ?? contextTeamId,
    channel,
    threadTs,
    userId: stringValue(assistantThread.user_id),
  };
}

export function toSlackAssistantMessage(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantMessage | undefined {
  const payloadRecord = asRecord(payload);
  const channel = stringValue(payloadRecord.channel);
  const threadTs = stringValue(payloadRecord.thread_ts);
  const prompt = cleanSlackText(stringValue(payloadRecord.text) ?? "");
  if (channel === undefined || threadTs === undefined || prompt === "") {
    return undefined;
  }

  return {
    teamId: contextTeamId,
    channel,
    threadTs,
    userId: stringValue(payloadRecord.user),
    prompt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
