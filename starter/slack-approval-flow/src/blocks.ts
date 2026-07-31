import {
  actions,
  button,
  header,
  section,
  type SlackBlock,
} from "./slack/blocks";

export const APPROVE_ACTION_ID = "approval.approve";
export const REJECT_ACTION_ID = "approval.reject";

export function startedBlocks(runId: string): SlackBlock[] {
  return [
    section(`*Approval workflow started*\nRun \`${runId}\` is drafting now.`),
  ];
}

export function draftReadyBlocks(
  draft: string,
  runId: string,
): SlackBlock[] {
  return [
    header("Draft ready for approval"),
    section(truncateBlockText(draft)),
    actions([
      button({
        text: "Approve",
        style: "primary",
        actionId: APPROVE_ACTION_ID,
        value: runId,
      }),
      button({
        text: "Reject",
        style: "danger",
        actionId: REJECT_ACTION_ID,
        value: runId,
      }),
    ]),
  ];
}

export function approvedBlocks(): SlackBlock[] {
  return statusBlocks("Approved", "Publishing now.");
}

export function rejectedBlocks(): SlackBlock[] {
  return statusBlocks("Rejected", "Workflow cancelled.");
}

export function publishedBlocks(published: string): SlackBlock[] {
  return [header("Published"), section(truncateBlockText(published))];
}

export function terminalStatusBlocks(status: string): SlackBlock[] {
  return statusBlocks("Workflow ended", `Status: \`${status}\``);
}

export function failedBlocks(message: string): SlackBlock[] {
  return statusBlocks("Workflow failed", truncateBlockText(message));
}

export function alreadyRunningBlocks(): SlackBlock[] {
  return statusBlocks(
    "Workflow already running",
    "Use the approval buttons in this thread.",
  );
}

export function notReadyBlocks(): SlackBlock[] {
  return statusBlocks(
    "Not waiting yet",
    "The draft will be posted before approval is available.",
  );
}

function statusBlocks(title: string, text: string): SlackBlock[] {
  return [section(`*${title}*\n${text}`)];
}

function truncateBlockText(text: string): string {
  return text.length > 2900 ? text.slice(0, 2897) + "..." : text;
}
