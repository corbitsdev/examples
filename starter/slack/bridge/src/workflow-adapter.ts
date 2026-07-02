import type {
  SlackAssistantMessage,
  SlackBlockAction,
  SlackEvent,
} from "./events";
import { cleanSlackText } from "./messages";

export type SlackWorkflowStartInput = {
  teamId: string | undefined;
  channel: string;
  threadTs: string;
  prompt: string;
};

export type SlackWorkflowActionHandler = (
  action: SlackBlockAction & { value: string },
) => void | Promise<void>;

export type SlackWorkflowAdapter = {
  onEvent: (teamId: string | undefined, event: SlackEvent) => Promise<void>;
  onBlockAction: (action: SlackBlockAction) => Promise<void>;
  onAssistantUserMessage: (message: SlackAssistantMessage) => Promise<void>;
};

export function createSlackWorkflowAdapter(opts: {
  onStart: (input: SlackWorkflowStartInput) => void | Promise<void>;
  actionHandlers: Record<string, SlackWorkflowActionHandler>;
  shouldStartEvent?: (event: SlackEvent) => boolean;
}): SlackWorkflowAdapter {
  const shouldStartEvent = opts.shouldStartEvent ?? isDefaultStartEvent;

  return {
    async onEvent(teamId, event) {
      if (!shouldStartEvent(event)) return;

      const channel = event.channel;
      const threadTs = event.thread_ts ?? event.ts;
      const prompt = cleanSlackText(event.text ?? "");
      if (channel === undefined || threadTs === undefined || prompt === "") {
        return;
      }

      await opts.onStart({ teamId, channel, threadTs, prompt });
    },

    async onBlockAction(action) {
      if (action.value === undefined) return;

      const handler = opts.actionHandlers[action.actionId];
      if (handler === undefined) return;

      await handler({ ...action, value: action.value });
    },

    async onAssistantUserMessage(message) {
      await opts.onStart({
        teamId: message.teamId,
        channel: message.channel,
        threadTs: message.threadTs,
        prompt: message.prompt,
      });
    },
  };
}

function isDefaultStartEvent(event: SlackEvent): boolean {
  if (event.bot_id !== undefined || event.subtype !== undefined) return false;
  if (event.type === "app_mention") return true;
  if (event.type !== "message") return false;
  return (event.channel ?? "").startsWith("D");
}
