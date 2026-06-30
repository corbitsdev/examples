import {
  cleanSlackText,
  type SlackBlockAction,
  type SlackAssistantMessage,
  type SlackEvent,
  type Write,
} from "@corbits/example-slack-bridge";

import { APPROVE_ACTION_ID, REJECT_ACTION_ID } from "./blocks";
import type { SlackWorkflowConfig } from "./config";
import { createApprovalSessions } from "./session";

export type SlackWorkflowAdapter = {
  onEvent: (teamId: string | undefined, event: SlackEvent) => Promise<void>;
  onBlockAction: (action: SlackBlockAction) => Promise<void>;
  onAssistantUserMessage: (message: SlackAssistantMessage) => Promise<void>;
};

export function createSlackWorkflowAdapter(opts: {
  config: SlackWorkflowConfig;
  stderr: Write;
}): SlackWorkflowAdapter {
  const sessions = createApprovalSessions(opts);

  return {
    async onEvent(teamId, event) {
      if (!isStartEvent(event)) return;

      const channel = event.channel;
      const threadTs = event.thread_ts ?? event.ts;
      const prompt = cleanSlackText(event.text ?? "");
      if (channel === undefined || threadTs === undefined || prompt === "") {
        return;
      }

      await sessions.start({ teamId, channel, threadTs, prompt });
    },

    async onBlockAction(action) {
      if (action.value === undefined) return;
      if (action.actionId === APPROVE_ACTION_ID) {
        await sessions.approve(action.value, action.userId);
        return;
      }
      if (action.actionId === REJECT_ACTION_ID) {
        await sessions.reject(action.value);
      }
    },

    async onAssistantUserMessage(message) {
      await sessions.start({
        teamId: message.teamId,
        channel: message.channel,
        threadTs: message.threadTs,
        prompt: message.prompt,
      });
    },
  };
}

function isStartEvent(event: SlackEvent): boolean {
  if (event.bot_id !== undefined || event.subtype !== undefined) return false;
  if (event.type === "app_mention") return true;
  if (event.type !== "message") return false;
  return (event.channel ?? "").startsWith("D");
}
