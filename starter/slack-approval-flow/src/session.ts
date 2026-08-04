import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import { runLocal, type WorkflowRun } from "@intx/workflow";
import type { ActionEvent, SentMessage, Thread } from "chat";

import {
  APPROVAL_SIGNAL,
  createAgentStepInvoker,
  defineApprovalFlow,
} from "./workflow";
import { APPROVE_ACTION_ID, approvalCard, statusCard } from "./cards";
import { SERVICE_NAME, type SlackWorkflowConfig } from "./config";

const DRAFT_TIMEOUT_MS = 60_000;

type PendingApproval = {
  run: WorkflowRun;
  thread: Thread;
  approvalMessage?: SentMessage;
  decision?: "approved" | "rejected";
};

type DraftObserver = {
  ready(draft: string): void;
  failed(error: unknown): void;
};

type ApprovalSessionOptions = {
  draftTimeoutMs?: number;
  startRun?: (request: string, draft: DraftObserver) => WorkflowRun;
};

type DraftOutcome =
  | { type: "ready"; draft: string }
  | { type: "failed"; error: unknown };

export function createApprovalSessions(
  config: SlackWorkflowConfig,
  stderr: (text: string) => void,
  opts: ApprovalSessionOptions = {},
) {
  const active = new Map<string, PendingApproval>();
  const draftTimeoutMs = opts.draftTimeoutMs ?? DRAFT_TIMEOUT_MS;
  const startRun =
    opts.startRun ??
    ((request: string, draft: DraftObserver) =>
      startApprovalRun(config, stderr, request, draft));

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post(
        statusCard("Workflow already running", "Use the approval card above."),
      );
      return;
    }

    const draftReady = Promise.withResolvers<DraftOutcome>();
    const run = startRun(event.text, {
      ready: (draft) => draftReady.resolve({ type: "ready", draft }),
      failed: (error) => draftReady.resolve({ type: "failed", error }),
    });
    const draftWait = waitForDraft(
      draftReady.promise,
      run.complete,
      draftTimeoutMs,
    );
    const pending: PendingApproval = { run, thread };
    active.set(thread.id, pending);

    try {
      await thread.post(
        statusCard("Workflow started", `Run \`${run.runId}\` is drafting.`),
      );
    } catch (error) {
      clear(pending);
      await run.cancel("self", "failed to post workflow start").catch(() => {});
      throw error;
    }

    void followRun(pending, draftWait);
  }

  async function decide(event: ActionEvent): Promise<void> {
    const pending = active.get(event.threadId);
    if (
      pending === undefined ||
      pending.approvalMessage === undefined ||
      pending.decision !== undefined ||
      event.value !== pending.run.runId
    ) {
      await explainUnavailableAction(event);
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

  async function explainUnavailableAction(event: ActionEvent): Promise<void> {
    if (event.thread === null) {
      stderr(`${SERVICE_NAME}: ignored unavailable action without a thread\n`);
      return;
    }

    try {
      await event.thread.postEphemeral(
        event.user,
        "This approval is no longer active.",
        { fallbackToDM: false },
      );
    } catch (error) {
      stderr(
        `${SERVICE_NAME}: failed to explain unavailable action: ${message(error)}\n`,
      );
    }
  }

  async function followRun(
    pending: PendingApproval,
    draftWait: Promise<DraftOutcome>,
  ): Promise<void> {
    try {
      const draft = await draftWait;
      if (draft.type === "failed") throw draft.error;

      pending.approvalMessage = await pending.thread.post(
        approvalCard(draft.draft, pending.run.runId),
      );

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
      clear(pending);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      void pending.run.cancel("self", detail).catch((cancelError) => {
        stderr(
          `${SERVICE_NAME}: failed to cancel workflow: ${message(cancelError)}\n`,
        );
      });
      try {
        await pending.thread.post(statusCard("Workflow failed", detail));
      } catch (postError) {
        stderr(
          `${SERVICE_NAME}: failed to post workflow failure: ${message(postError)}\n`,
        );
      }
    } finally {
      clear(pending);
    }
  }

  function clear(pending: PendingApproval): void {
    if (active.get(pending.thread.id) === pending) {
      active.delete(pending.thread.id);
    }
  }

  return { start, decide };
}

function startApprovalRun(
  config: SlackWorkflowConfig,
  stderr: (text: string) => void,
  request: string,
  draft: DraftObserver,
): WorkflowRun {
  const invokeAgentStep = createAgentStepInvoker({
    source: config.source,
    contextRoot: join(config.contextRoot, randomUUID()),
    log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
    onStepDone: (stepId, output) => {
      if (stepId === "draft") draft.ready(output);
    },
  });
  const invokeStep: typeof invokeAgentStep = async (input) => {
    try {
      return await invokeAgentStep(input);
    } catch (error) {
      const stepId = input.authzContext.stepId ?? input.agent.id;
      if (stepId === "draft") draft.failed(error);
      throw error;
    }
  };

  return runLocal(defineApprovalFlow(config.source), {
    triggerPayload: request,
    invokeStep,
  });
}

function waitForDraft(
  draft: Promise<DraftOutcome>,
  complete: WorkflowRun["complete"],
  timeoutMs: number,
): Promise<DraftOutcome> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<DraftOutcome>((resolve) => {
    timeout = setTimeout(
      () =>
        resolve({
          type: "failed",
          error: new Error("Drafting did not finish within one minute."),
        }),
      timeoutMs,
    );
  });

  return Promise.race<DraftOutcome>([
    draft,
    complete.then((result) => ({
      type: "failed",
      error: new Error(
        `Workflow ${result.terminalStatus} before producing a draft.`,
      ),
    })),
    timedOut,
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
