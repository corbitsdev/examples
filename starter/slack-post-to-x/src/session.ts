import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import { runLocal, type WorkflowRun } from "@intx/workflow";
import type { CardElement } from "chat";

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

type PostMessage = {
  id: string;
  edit(content: CardElement): Promise<PostMessage>;
};

type PostThread = {
  id: string;
  post(content: CardElement): Promise<PostMessage>;
};

export type PostActionEvent = {
  actionId: string;
  messageId: string;
  threadId: string;
  value?: string;
  user: { userId: string };
};

type PendingPost = {
  approvalId: string;
  thread: PostThread;
  run?: WorkflowRun;
  validatedPost?: ValidatedPost;
  approvalMessage?: PostMessage;
  decision?: "approved" | "rejected";
  validationError?: string;
};

type CreateRun = (opts: {
  prompt: string;
  approvalId: string;
  onValidated: (post: ValidatedPost) => void;
  onValidationFailed: (error: unknown) => Promise<void>;
}) => WorkflowRun;

export function createPostSessions(
  config: PostToXConfig,
  stderr: (text: string) => void,
  deps: {
    createRun?: CreateRun;
    newId?: () => string;
    now?: () => Date;
  } = {},
) {
  const active = new Map<string, PendingPost>();
  const newId = deps.newId ?? randomUUID;
  const now = deps.now ?? (() => new Date());

  async function start(event: TagEvent, thread: PostThread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post(
        statusCard("Workflow already running", "Use the approval card above."),
      );
      return;
    }

    const pending: PendingPost = { approvalId: newId(), thread };
    active.set(thread.id, pending);
    const validatedReady = deferred<ValidatedPost>();
    try {
      const createRun = deps.createRun ?? defaultCreateRun;
      const run = createRun({
        prompt: event.text,
        approvalId: pending.approvalId,
        onValidated: validatedReady.resolve,
        onValidationFailed: async (error) => {
          pending.validationError = message(error);
          await pending.run?.cancel("self", pending.validationError);
        },
      });
      pending.run = run;
      if (pending.validationError !== undefined) {
        await run.cancel("self", pending.validationError);
      }
      await thread.post(startedCard(run.runId));
      void followRun(pending, validatedReady.promise);
    } catch (error) {
      cleanup(pending);
      await pending.run?.cancel("self", message(error)).catch(() => {});
      throw error;
    }
  }

  async function decide(event: PostActionEvent): Promise<void> {
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
            approvedAt: now().toISOString(),
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
    onValidationFailed: (error: unknown) => Promise<void>;
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

  async function followRun(
    pending: PendingPost,
    validatedReady: Promise<ValidatedPost>,
  ): Promise<void> {
    const run = pending.run;
    if (run === undefined) return;
    try {
      const post = await Promise.race([
        validatedReady,
        run.complete.then(() => undefined),
      ]);
      if (post !== undefined && owns(pending)) {
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
      await run.cancel("self", detail).catch(() => {});
      await pending.thread
        .post(statusCard("Workflow failed", detail))
        .catch(() => {});
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
