import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent, GenericMessageEvent } from "@slack/types";
import { type } from "arktype";

import { cleanSlackText } from "./messages";

const BlockActionPayload = type({
  action_id: "string > 0",
  "value?": "string > 0",
});

const BlockActionBody = type({
  "user?": { "id?": "string > 0" },
  "channel?": { "id?": "string > 0" },
  "message?": { "ts?": "string > 0" },
  "container?": { "message_ts?": "string > 0" },
  "team?": { "id?": "string > 0" },
});

const AssistantThreadPayload = type({
  assistant_thread: {
    channel_id: "string > 0",
    thread_ts: "string > 0",
    "user_id?": "string > 0",
    "context?": { "team_id?": "string > 0" },
  },
});

const AssistantMessagePayload = type({
  channel: "string > 0",
  thread_ts: "string > 0",
  text: "string > 0",
  "user?": "string > 0",
});

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
  const parsedAction = BlockActionPayload(action);
  if (parsedAction instanceof type.errors) {
    throw new Error(`Invalid Slack block action: ${parsedAction.summary}`);
  }
  const parsedBody = BlockActionBody(body);
  if (parsedBody instanceof type.errors) {
    throw new Error(`Invalid Slack block action body: ${parsedBody.summary}`);
  }

  return {
    actionId: parsedAction.action_id,
    value: parsedAction.value,
    teamId: parsedBody.team?.id ?? contextTeamId,
    userId: parsedBody.user?.id,
    channelId: parsedBody.channel?.id,
    messageTs: parsedBody.message?.ts ?? parsedBody.container?.message_ts,
  };
}

export function toSlackAssistantThread(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantThread | undefined {
  const parsed = AssistantThreadPayload(payload);
  if (parsed instanceof type.errors) return undefined;
  const thread = parsed.assistant_thread;

  return {
    teamId: thread.context?.team_id ?? contextTeamId,
    channel: thread.channel_id,
    threadTs: thread.thread_ts,
    userId: thread.user_id,
  };
}

export function toSlackAssistantMessage(
  contextTeamId: string | undefined,
  payload: unknown,
): SlackAssistantMessage | undefined {
  const parsed = AssistantMessagePayload(payload);
  if (parsed instanceof type.errors) return undefined;
  const prompt = cleanSlackText(parsed.text);
  if (prompt === "") return undefined;

  return {
    teamId: contextTeamId,
    channel: parsed.channel,
    threadTs: parsed.thread_ts,
    userId: parsed.user,
    prompt,
  };
}
