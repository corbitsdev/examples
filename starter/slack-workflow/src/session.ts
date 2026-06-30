import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  APPROVAL_SIGNAL,
  createInvokeStep,
  defineApprovalFlow,
} from "@corbits/example-workflow-approval-flow";
import {
  postMessage,
  truncateForSlack,
  type Write,
} from "@corbits/example-slack-bridge";
import {
  runLocal,
  type WorkflowAuthorizeFn,
  type WorkflowRun,
} from "@intx/workflow";

import {
  alreadyRunningBlocks,
  approvedBlocks,
  draftReadyBlocks,
  failedBlocks,
  notReadyBlocks,
  publishedBlocks,
  rejectedBlocks,
  startedBlocks,
  terminalStatusBlocks,
} from "./blocks";
import { SERVICE_NAME, type SlackWorkflowConfig } from "./config";

type PendingApproval = {
  key: string;
  channel: string;
  threadTs: string;
  run: WorkflowRun;
  status: "drafting" | "awaiting-approval" | "resuming" | "finished";
};

export type ApprovalSessions = {
  start: (input: {
    teamId: string | undefined;
    channel: string;
    threadTs: string;
    prompt: string;
  }) => Promise<void>;
  approve: (key: string, userId: string | undefined) => Promise<void>;
  reject: (key: string) => Promise<void>;
};

export function createApprovalSessions(opts: {
  config: SlackWorkflowConfig;
  stderr: Write;
}): ApprovalSessions {
  const { config, stderr } = opts;
  const pendingByThread = new Map<string, PendingApproval>();

  async function start(input: {
    teamId: string | undefined;
    channel: string;
    threadTs: string;
    prompt: string;
  }): Promise<void> {
    const key = threadKey(input.teamId, input.channel, input.threadTs);
    const existing = pendingByThread.get(key);
    if (existing !== undefined && existing.status !== "finished") {
      await postMessage(config.botToken, {
        channel: input.channel,
        thread_ts: input.threadTs,
        text: "An approval workflow is already running here.",
        blocks: alreadyRunningBlocks(),
      });
      return;
    }

    const outputs = new Map<string, string>();
    const draftReady = deferred<void>();
    const authorize = createSlackAuthorize();
    const invokeStep = createInvokeStep({
      source: config.source,
      contextRoot: join(config.contextRoot, safePathSegment(randomUUID())),
      authorize,
      log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
      onStepDone: (stepId, output) => {
        outputs.set(stepId, output);
        if (stepId === "draft") draftReady.resolve();
      },
    });

    const run = runLocal(defineApprovalFlow(config.source), {
      triggerPayload: input.prompt,
      invokeStep,
      authorize,
    });

    const pending: PendingApproval = {
      key,
      channel: input.channel,
      threadTs: input.threadTs,
      run,
      status: "drafting",
    };
    pendingByThread.set(key, pending);

    await postMessage(config.botToken, {
      channel: pending.channel,
      thread_ts: pending.threadTs,
      text: `Started approval workflow ${run.runId}. Drafting now...`,
      blocks: startedBlocks(run.runId),
    });

    void postDraftWhenReady(pending, draftReady.promise, outputs);
    void postTerminalResult(pending, outputs);
  }

  async function approve(
    key: string,
    userId: string | undefined,
  ): Promise<void> {
    const pending = pendingByThread.get(key);
    if (pending === undefined || pending.status === "finished") return;
    if (pending.status !== "awaiting-approval") {
      await postNotReady(pending);
      return;
    }

    pending.status = "resuming";
    await pending.run.signal(APPROVAL_SIGNAL, {
      approvedBy: userId ?? "slack-user",
      approvedAt: new Date().toISOString(),
      channel: pending.channel,
      threadTs: pending.threadTs,
    });
    await postMessage(config.botToken, {
      channel: pending.channel,
      thread_ts: pending.threadTs,
      text: "Approved. Publishing now...",
      blocks: approvedBlocks(),
    });
  }

  async function reject(key: string): Promise<void> {
    const pending = pendingByThread.get(key);
    if (pending === undefined || pending.status === "finished") return;
    if (pending.status !== "awaiting-approval") {
      await postNotReady(pending);
      return;
    }

    pending.status = "resuming";
    await pending.run.cancel("supervisor-operator", "rejected from Slack");
    await postMessage(config.botToken, {
      channel: pending.channel,
      thread_ts: pending.threadTs,
      text: "Rejected. Workflow cancelled.",
      blocks: rejectedBlocks(),
    });
  }

  async function postDraftWhenReady(
    pending: PendingApproval,
    draftReady: Promise<void>,
    outputs: Map<string, string>,
  ): Promise<void> {
    try {
      await Promise.race([draftReady, pending.run.complete.then(() => undefined)]);
      if (pending.status !== "drafting") return;

      const draft = outputs.get("draft");
      if (draft === undefined) return;

      pending.status = "awaiting-approval";
      await postMessage(config.botToken, {
        channel: pending.channel,
        thread_ts: pending.threadTs,
        text: truncateForSlack(
          `Draft ready for approval:\n\n${draft}\n\nApprove or reject in Slack.`,
        ),
        blocks: draftReadyBlocks(draft, pending.key),
      });
    } catch (error) {
      stderr(`${SERVICE_NAME}: failed to post draft: ${errorMessage(error)}\n`);
    }
  }

  async function postTerminalResult(
    pending: PendingApproval,
    outputs: Map<string, string>,
  ): Promise<void> {
    try {
      const result = await pending.run.complete;
      pending.status = "finished";
      pendingByThread.delete(pending.key);

      if (result.terminalStatus === "completed") {
        const published = String(
          result.outputs.publish ?? outputs.get("publish") ?? "",
        );
        await postMessage(config.botToken, {
          channel: pending.channel,
          thread_ts: pending.threadTs,
          text: truncateForSlack(`Published:\n\n${published}`),
          blocks: publishedBlocks(published),
        });
        return;
      }

      await postMessage(config.botToken, {
        channel: pending.channel,
        thread_ts: pending.threadTs,
        text: `Approval workflow ended with status ${result.terminalStatus}.`,
        blocks: terminalStatusBlocks(result.terminalStatus),
      });
    } catch (error) {
      const message = errorMessage(error);
      stderr(`${SERVICE_NAME}: workflow failed: ${message}\n`);
      pending.status = "finished";
      pendingByThread.delete(pending.key);
      await postMessage(config.botToken, {
        channel: pending.channel,
        thread_ts: pending.threadTs,
        text: truncateForSlack(`Approval workflow failed: ${message}`),
        blocks: failedBlocks(message),
      }).catch(() => undefined);
    }
  }

  async function postNotReady(pending: PendingApproval): Promise<void> {
    await postMessage(config.botToken, {
      channel: pending.channel,
      thread_ts: pending.threadTs,
      text: "The workflow is not waiting for approval yet.",
      blocks: notReadyBlocks(),
    });
  }

  return { start, approve, reject };
}

function createSlackAuthorize(): WorkflowAuthorizeFn {
  return async (resource, action) => ({
    effect: "allow",
    matchingGrants: [
      {
        id: "slack-operator-grant",
        resource,
        action,
        effect: "allow",
        origin: "invoker",
        specificity: 100,
      },
    ],
    resolvedBy: {
      id: "slack-operator-grant",
      resource,
      action,
      effect: "allow",
      origin: "invoker",
      specificity: 100,
    },
  });
}

function threadKey(
  teamId: string | undefined,
  channel: string,
  threadTs: string,
): string {
  return [teamId ?? "unknown-team", channel, threadTs].join("-");
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
