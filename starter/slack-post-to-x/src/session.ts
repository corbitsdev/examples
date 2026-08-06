import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import { runLocal, type WorkflowRun } from "@intx/workflow";
import type { ActionEvent, SentMessage, Thread } from "chat";

import { createPostActionResolver, createPostAuthorize } from "./actions";
import {
  APPROVE_ACTION_ID,
  approvalCard,
  receiptCard,
  REJECT_ACTION_ID,
  startedCard,
  statusCard,
} from "./cards";
import { SERVICE_NAME, type PostToXConfig } from "./config";
import type { ValidatedPost } from "./post";
import {
  APPROVAL_SIGNAL,
  createDraftStepInvoker,
  definePostWorkflow,
} from "./workflow";
import { requirePostReceipt } from "./x-client";

const DRAFT_TIMEOUT_MS = 60_000;

type PendingPost = {
  approvalId: string;
  thread: Thread;
  run?: WorkflowRun;
  validatedPost?: ValidatedPost;
  approvalMessage?: SentMessage;
  decision?: "approved" | "rejected";
  validationError?: string;
};

export function createPostSessions(
  config: PostToXConfig,
  stderr: (text: string) => void,
) {
  const active = new Map<string, PendingPost>();

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post(
        statusCard("Workflow already running", "Use the approval card above."),
      );
      return;
    }

    const pending: PendingPost = { approvalId: randomUUID(), thread };
    active.set(thread.id, pending);
    const draftReady = Promise.withResolvers<ValidatedPost>();
    try {
      const run = defaultCreateRun({
        prompt: event.text,
        approvalId: pending.approvalId,
        onValidated: draftReady.resolve,
        onValidationFailed: (error) => {
          pending.validationError = message(error);
          draftReady.reject(error);
          void pending.run?.cancel("self", pending.validationError);
        },
      });
      pending.run = run;
      await thread.post(startedCard(run.runId));
      void followRun(pending, waitForDraft(draftReady.promise, run.complete));
    } catch (error) {
      cleanup(pending);
      await pending.run?.cancel("self", message(error)).catch(() => {});
      throw error;
    }
  }

  async function decide(event: ActionEvent): Promise<void> {
    const pending = active.get(event.threadId);
    const actorId = event.user.userId.trim();
    if (
      pending === undefined ||
      pending.run === undefined ||
      pending.validatedPost === undefined ||
      pending.approvalMessage === undefined ||
      pending.decision !== undefined ||
      actorId === "" ||
      event.value !== pending.approvalId ||
      event.messageId !== pending.approvalMessage.id ||
      (event.actionId !== APPROVE_ACTION_ID &&
        event.actionId !== REJECT_ACTION_ID)
    ) {
      await explainUnavailableAction(event);
      return;
    }

    const approved = event.actionId === APPROVE_ACTION_ID;
    pending.decision = approved ? "approved" : "rejected";
    try {
      if (approved) {
        await pending.run.signal(
          APPROVAL_SIGNAL,
          {
            approvedBy: actorId,
            approvedAt: new Date().toISOString(),
            threadId: event.threadId,
          },
          pending.approvalId,
        );
      } else {
        await pending.run.cancel("supervisor-operator", "rejected from Slack");
      }
    } catch (error) {
      if (owns(pending)) pending.decision = undefined;
      throw error;
    }

    const card = approved
      ? statusCard("Approved", "Publishing the validated text now.")
      : statusCard("Rejected", "Workflow cancelled. Nothing was posted.");
    try {
      await pending.approvalMessage.edit(card);
    } catch (error) {
      stderr(
        `${SERVICE_NAME}: failed to update approval card: ${message(error)}\n`,
      );
      await pending.thread.post(card);
    }
  }

  function defaultCreateRun(opts: {
    prompt: string;
    approvalId: string;
    onValidated: (post: ValidatedPost) => void;
    onValidationFailed: (error: unknown) => void;
  }): WorkflowRun {
    const authorize = createPostAuthorize();
    return runLocal(definePostWorkflow(config.source), {
      triggerPayload: opts.prompt,
      authorize,
      invokeStep: createDraftStepInvoker({
        source: config.source,
        contextRoot: join(config.contextRoot, opts.approvalId),
        authorize,
        log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
      }),
      actionResolver: createPostActionResolver({
        publisher: config.publisher,
        onValidated: opts.onValidated,
        onValidationFailed: opts.onValidationFailed,
      }),
    });
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
    pending: PendingPost,
    draftWait: Promise<ValidatedPost>,
  ): Promise<void> {
    const run = pending.run;
    if (run === undefined) return;
    try {
      const post = await draftWait;

      if (owns(pending)) {
        pending.validatedPost = post;
        pending.approvalMessage = await pending.thread.post(
          approvalCard(post, pending.approvalId),
        );
      }

      const result = await run.complete;
      cleanup(pending);
      if (result.terminalStatus === "completed") {
        await pending.thread.post(
          receiptCard(requirePostReceipt(result.outputs.publish)),
        );
      } else if (pending.validationError !== undefined) {
        await pending.thread.post(
          statusCard("Validation failed", pending.validationError),
        );
      } else if (pending.decision === undefined) {
        await pending.thread.post(
          statusCard("Workflow ended", `Status: ${result.terminalStatus}`),
        );
      }
    } catch (error) {
      cleanup(pending);
      const detail = message(error);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      void run.cancel("self", detail).catch((cancelError) => {
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
    }
  }

  function owns(pending: PendingPost): boolean {
    const current = active.get(pending.thread.id);
    return current === pending && current.approvalId === pending.approvalId;
  }

  function cleanup(pending: PendingPost): void {
    if (owns(pending)) active.delete(pending.thread.id);
  }

  return { start, decide };
}

function waitForDraft(
  draft: Promise<ValidatedPost>,
  complete: WorkflowRun["complete"],
): Promise<ValidatedPost> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () =>
        reject(new Error("Drafting did not finish within one minute.")),
      DRAFT_TIMEOUT_MS,
    );
  });

  return Promise.race([
    draft,
    complete.then((result) =>
      Promise.reject(
        new Error(
          `Workflow ${result.terminalStatus} before producing a draft.`,
        ),
      ),
    ),
    timedOut,
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
