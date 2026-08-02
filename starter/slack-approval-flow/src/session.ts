import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import {
  runLocal,
  type WorkflowAuthorizeFn,
  type WorkflowRun,
} from "@intx/workflow";
import type { ActionEvent, SentMessage, Thread } from "chat";

import {
  APPROVAL_SIGNAL,
  createInvokeStep,
  defineApprovalFlow,
} from "./workflow";
import { APPROVE_ACTION_ID, approvalCard, statusCard } from "./cards";
import { SERVICE_NAME, type SlackWorkflowConfig } from "./config";

type PendingApproval = {
  run: WorkflowRun;
  thread: Thread;
  approvalMessage?: SentMessage;
  decision?: "approved" | "rejected";
};

const allow: WorkflowAuthorizeFn = async () => ({
  effect: "allow",
  matchingGrants: [],
  resolvedBy: null,
});

export function createApprovalSessions(
  config: SlackWorkflowConfig,
  stderr: (text: string) => void,
) {
  const active = new Map<string, PendingApproval>();

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post(
        statusCard("Workflow already running", "Use the approval card above."),
      );
      return;
    }

    let resolveDraft!: (draft: string) => void;
    const draftReady = new Promise<string>((resolve) => {
      resolveDraft = resolve;
    });
    const run = runLocal(defineApprovalFlow(config.source), {
      triggerPayload: event.text,
      authorize: allow,
      invokeStep: createInvokeStep({
        source: config.source,
        contextRoot: join(config.contextRoot, randomUUID()),
        authorize: allow,
        log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        onStepDone: (stepId, output) => {
          if (stepId === "draft") resolveDraft(output);
        },
      }),
    });
    const pending: PendingApproval = { run, thread };
    active.set(thread.id, pending);

    try {
      await thread.post(
        statusCard("Workflow started", `Run \`${run.runId}\` is drafting.`),
      );
    } catch (error) {
      active.delete(thread.id);
      await run.cancel("self", "failed to post workflow start").catch(() => {});
      throw error;
    }

    void followRun(pending, draftReady);
  }

  async function decide(event: ActionEvent): Promise<void> {
    const pending = active.get(event.threadId);
    if (
      pending === undefined ||
      pending.approvalMessage === undefined ||
      pending.decision !== undefined ||
      event.value !== pending.run.runId
    ) {
      return;
    }

    const approved = event.actionId === APPROVE_ACTION_ID;
    pending.decision = approved ? "approved" : "rejected";
    try {
      if (approved) {
        await pending.run.signal(APPROVAL_SIGNAL, {
          approvedBy: event.user.userId,
          approvedAt: new Date().toISOString(),
          threadId: event.threadId,
        });
      } else {
        await pending.run.cancel("supervisor-operator", "rejected from Slack");
      }
    } catch (error) {
      pending.decision = undefined;
      throw error;
    }

    const card = approved
      ? statusCard("Approved", "Publishing now.")
      : statusCard("Rejected", "Workflow cancelled.");
    try {
      await pending.approvalMessage.edit(card);
    } catch (error) {
      stderr(
        `${SERVICE_NAME}: failed to update approval card: ${message(error)}\n`,
      );
      await pending.thread.post(card);
    }
  }

  async function followRun(
    pending: PendingApproval,
    draftReady: Promise<string>,
  ): Promise<void> {
    try {
      const draft = await Promise.race([
        draftReady,
        pending.run.complete.then(() => undefined),
      ]);
      if (draft !== undefined) {
        pending.approvalMessage = await pending.thread.post(
          approvalCard(draft, pending.run.runId),
        );
      }

      const result = await pending.run.complete;
      if (result.terminalStatus === "completed") {
        await pending.thread.post(
          statusCard("Published", String(result.outputs.publish ?? "")),
        );
      } else if (pending.decision === undefined) {
        await pending.thread.post(
          statusCard("Workflow ended", `Status: \`${result.terminalStatus}\``),
        );
      }
    } catch (error) {
      const detail = message(error);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      await pending.run.cancel("self", detail).catch(() => {});
      await pending.thread
        .post(statusCard("Workflow failed", detail))
        .catch(() => {});
    } finally {
      if (active.get(pending.thread.id) === pending) {
        active.delete(pending.thread.id);
      }
    }
  }

  return { start, decide };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
