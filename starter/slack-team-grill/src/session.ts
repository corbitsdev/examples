import { randomUUID } from "node:crypto";

import {
  DECISION_SIGNAL,
  createInvokeStep,
  createLocalWorkflowAuthorize,
  defineTeamGrillRoundWorkflow,
} from "./workflow";
import type {
  GrillDecision,
  GrillQuestion,
  GrillReport,
  GrillTurn,
} from "./types";
import type { TagEvent } from "@corbits/tag-slack";
import {
  runLocal,
  type WorkflowEvent,
  type WorkflowRun,
} from "@intx/workflow";
import type { ActionEvent, SentMessage, Thread } from "chat";

import {
  actionIdFor,
  alreadyRunningCard,
  completedCard,
  failedCard,
  finalReportText,
  lockedQuestionCard,
  questionCard,
} from "./cards";
import { SERVICE_NAME, type TeamGrillConfig } from "./config";
import { parseSelectionValue, selectionValue } from "./selection";

type SessionStatus =
  | "generating"
  | "awaiting-choice"
  | "advancing"
  | "delivering-report"
  | "finished";

type PendingGrill = {
  id: string;
  request: string;
  thread: Thread;
  run?: WorkflowRun;
  status: SessionStatus;
  currentQuestion?: GrillQuestion;
  currentMessage?: SentMessage;
  decisions: GrillDecision[];
};

export type TeamGrillSessions = {
  start(event: TagEvent, thread: Thread): Promise<void>;
  select(event: ActionEvent): Promise<void>;
};

export type TeamGrillRunInput = {
  request: string;
  decisions: GrillDecision[];
  round: number;
};

type RunHooks = {
  log: (line: string) => void;
  onStepDone: (stepId: string, output: GrillTurn | GrillReport) => void;
};

export type TeamGrillSessionOptions = {
  runWorkflow?: (input: TeamGrillRunInput, hooks: RunHooks) => WorkflowRun;
};

const RUN_TIMEOUT_MS = 15 * 60 * 1_000;
const SLACK_POST_TIMEOUT_MS = 10_000;

export function createTeamGrillSessions(
  config: TeamGrillConfig,
  stderr: (text: string) => void,
  options: TeamGrillSessionOptions = {},
): TeamGrillSessions {
  const byThread = new Map<string, PendingGrill>();
  const byId = new Map<string, PendingGrill>();
  const runWorkflow =
    options.runWorkflow ??
    ((input: TeamGrillRunInput, hooks: RunHooks): WorkflowRun => {
      const authorize = createLocalWorkflowAuthorize();
      return runLocal(defineTeamGrillRoundWorkflow(config.source), {
        triggerPayload: input,
        authorize,
        invokeStep: createInvokeStep({
          source: config.source,
          contextRoot: config.contextRoot,
          authorize,
          log: hooks.log,
          onStepDone: hooks.onStepDone,
        }),
      });
    });

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    if (byThread.has(thread.id)) {
      await thread.post(alreadyRunningCard());
      return;
    }

    const pending: PendingGrill = {
      id: randomUUID(),
      request: event.text,
      thread,
      status: "generating",
      decisions: [],
    };
    byThread.set(thread.id, pending);
    byId.set(pending.id, pending);
    await runRound(pending);
  }

  async function runRound(pending: PendingGrill): Promise<void> {
    pending.status = "generating";
    pending.currentQuestion = undefined;
    pending.currentMessage = undefined;
    const round = pending.decisions.length + 1;
    const outputs = new Map<string, GrillTurn | GrillReport>();
    const generateReady = deferred<void>();
    const reportReady = deferred<GrillReport>();
    const run = runWorkflow(
      {
        request: pending.request,
        decisions: [...pending.decisions],
        round,
      },
      {
        log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        onStepDone: (stepId, output) => {
          outputs.set(stepId, output);
          if (stepId === "generate") generateReady.resolve();
          if (stepId === "report" && isReport(output)) {
            reportReady.resolve(output);
          }
        },
      },
    );
    pending.run = run;

    const timeout = setTimeout(() => {
      if (pending.status === "finished" || pending.run !== run) return;
      void run
        .cancel(
          "supervisor-operator",
          `Team Grill round timed out after ${String(RUN_TIMEOUT_MS)}ms`,
        )
        .catch(() => undefined);
    }, RUN_TIMEOUT_MS);

    try {
      await Promise.race([
        generateReady.promise,
        run.complete.then(() => undefined),
      ]);
      const turn = outputs.get("generate");
      if (isQuestion(turn)) {
        const posted = await pending.thread.post(
          questionCard(
            turn,
            (optionId) =>
              selectionValue({
                sessionId: pending.id,
                round,
                optionId,
              }),
            run.runId,
          ),
        );
        pending.currentQuestion = turn;
        pending.currentMessage = posted;
        pending.status = "awaiting-choice";
        return;
      }

      pending.status = "delivering-report";
      const terminal = await Promise.race([
        reportReady.promise.then((report) => ({
          kind: "report" as const,
          report,
        })),
        run.complete.then((completed) => ({
          kind: "complete" as const,
          completed,
        })),
      ]);
      if (
        terminal.kind === "complete" &&
        terminal.completed.terminalStatus !== "completed"
      ) {
        throw workflowFailure(
          terminal.completed.events,
          terminal.completed.terminalStatus,
        );
      }
      const report =
        terminal.kind === "report"
          ? terminal.report
          : terminal.completed.outputs.report ?? outputs.get("report");
      if (!isReport(report)) throw new Error("Report step returned no report");

      await postFinalReport({
        thread: pending.thread,
        report,
        decisions: pending.decisions,
        runId: run.runId,
        log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
      });
      stderr(`${SERVICE_NAME}: final summary posted\n`);
      finishSession(pending);
      if (terminal.kind === "report") {
        void run
          .cancel(
            "self",
            "Final report delivered before the local run settled",
          )
          .catch(() => undefined);
      }
    } catch (error) {
      await postFailure(pending, run, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function select(event: ActionEvent): Promise<void> {
    const selection = parseSelectionValue(event.value);
    if (selection === undefined) return;
    const pending = byId.get(selection.sessionId);
    if (
      pending === undefined ||
      byThread.get(event.threadId) !== pending ||
      pending.thread.id !== event.threadId ||
      pending.status !== "awaiting-choice" ||
      pending.currentQuestion?.round !== selection.round ||
      pending.currentMessage === undefined ||
      pending.run === undefined ||
      event.actionId !== actionIdFor(selection.optionId)
    ) {
      return;
    }
    const option = pending.currentQuestion.options.find(
      (candidate) => candidate.id === selection.optionId,
    );
    if (option === undefined) return;

    const question = pending.currentQuestion;
    const currentMessage = pending.currentMessage;
    const run = pending.run;
    pending.status = "advancing";
    pending.currentQuestion = undefined;
    pending.currentMessage = undefined;
    const decision: GrillDecision = {
      round: selection.round,
      question: question.question,
      selectedOptionId: option.id,
      selectedOptionTitle: option.title,
      finalizedBy: event.user.userId,
    };
    pending.decisions.push(decision);

    try {
      await run.signal(DECISION_SIGNAL, {
        decisions: [...pending.decisions],
      });
      const completed = await run.complete;
      if (completed.terminalStatus !== "completed") {
        throw workflowFailure(completed.events, completed.terminalStatus);
      }

      const locked = lockedQuestionCard(question, decision);
      try {
        await currentMessage.edit(locked);
      } catch (error) {
        stderr(
          `${SERVICE_NAME}: failed to update finalized question; posting replacement: ${errorMessage(error)}\n`,
        );
        await pending.thread.post(locked);
      }
      await runRound(pending);
    } catch (error) {
      await postFailure(pending, run, error);
    }
  }

  async function postFailure(
    pending: PendingGrill,
    run: WorkflowRun,
    error: unknown,
  ): Promise<void> {
    const message = errorMessage(error);
    stderr(`${SERVICE_NAME}: workflow failed: ${message}\n`);
    await run.cancel("self", message).catch(() => undefined);
    await pending.thread
      .post(failedCard(run.runId, message))
      .catch(() => undefined);
    finishSession(pending);
  }

  function finishSession(pending: PendingGrill): void {
    pending.status = "finished";
    if (byThread.get(pending.thread.id) === pending) {
      byThread.delete(pending.thread.id);
    }
    byId.delete(pending.id);
  }

  return { start, select };
}

async function postFinalReport(options: {
  thread: Thread;
  report: GrillReport;
  decisions: GrillDecision[];
  runId: string;
  log: (line: string) => void;
}): Promise<void> {
  try {
    await withTimeout(
      options.thread.post(
        completedCard(options.report, options.decisions, options.runId),
      ),
      SLACK_POST_TIMEOUT_MS,
      "Final Slack report timed out",
    );
  } catch (error) {
    options.log(
      `rich final report failed; retrying plain text: ${errorMessage(error)}`,
    );
    await withTimeout(
      options.thread.post(
        reportFallbackText(options.report, options.decisions, options.runId),
      ),
      SLACK_POST_TIMEOUT_MS,
      "Plain-text Slack report timed out",
    );
  }
}

function reportFallbackText(
  report: GrillReport,
  decisions: GrillDecision[],
  runId: string,
): string {
  return finalReportText(report, decisions, runId).replace(
    "\n\nConclusion\n",
    "\n\nDirection\n",
  );
}

function primaryFailure(
  events: readonly WorkflowEvent[],
): Extract<WorkflowEvent, { kind: "StepFailed" }> | undefined {
  return events.find(
    (event): event is Extract<WorkflowEvent, { kind: "StepFailed" }> =>
      event.kind === "StepFailed",
  );
}

function workflowFailure(
  events: readonly WorkflowEvent[],
  terminalStatus: string,
): Error {
  const failure = primaryFailure(events);
  return new Error(
    failure?.error.message ?? `Workflow ended with ${terminalStatus}`,
  );
}

function isQuestion(
  value: GrillTurn | GrillReport | undefined,
): value is GrillQuestion {
  return value !== undefined && "needsQuestion" in value && value.needsQuestion;
}

function isReport(value: unknown): value is GrillReport {
  return (
    value !== null &&
    typeof value === "object" &&
    "conclusion" in value &&
    typeof value.conclusion === "string" &&
    "openItems" in value &&
    Array.isArray(value.openItems)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
