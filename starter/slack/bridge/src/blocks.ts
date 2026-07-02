import type { ActionsBlock, Block, Button, KnownBlock } from "@slack/types";

export type SlackBlock = KnownBlock | Block;

export function header(text: string): SlackBlock {
  return {
    type: "header",
    text: { type: "plain_text", text },
  };
}

export function section(text: string): SlackBlock {
  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
}

export function actions(elements: ActionsBlock["elements"]): SlackBlock {
  return {
    type: "actions",
    elements,
  };
}

export function button(opts: {
  text: string;
  actionId: string;
  value: string;
  style?: "primary" | "danger";
}): Button {
  return {
    type: "button",
    text: { type: "plain_text", text: opts.text },
    style: opts.style,
    action_id: opts.actionId,
    value: opts.value,
  };
}
