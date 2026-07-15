import {
  createSlackWorkflowAdapter,
  type SlackWorkflowAdapter,
  type Write,
} from "@corbits/example-slack-bridge";

import { APPROVE_ACTION_ID, REJECT_ACTION_ID } from "./blocks";
import type { SlackWorkflowConfig } from "./config";
import { createApprovalSessions } from "./session";

export type { SlackWorkflowAdapter };

export function createApprovalWorkflowAdapter(opts: {
  config: SlackWorkflowConfig;
  stderr: Write;
}): SlackWorkflowAdapter {
  const sessions = createApprovalSessions(opts);

  return createSlackWorkflowAdapter({
    onStart: sessions.start,
    actionHandlers: {
      [APPROVE_ACTION_ID]: (action) =>
        sessions.approve(action.value, action.userId),
      [REJECT_ACTION_ID]: (action) => sessions.reject(action.value),
    },
  });
}
