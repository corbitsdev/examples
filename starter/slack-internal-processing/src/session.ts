import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  runLocal,
  type RunResult,
  type WorkflowRun,
} from "@intx/workflow";
import type { Attachment, Thread } from "chat";

import { callDigestCards, statusCard } from "./cards";
import { SERVICE_NAME, type SlackCallDigestConfig } from "./config";
import { parseCallDigest } from "./parser";
import type { CallDigestInput } from "./types";
import {
  createInternalProcessingStepInvoker,
  defineInternalProcessing,
} from "./workflow";

type ActiveRun = Pick<WorkflowRun, "runId" | "complete" | "cancel">;
const MAX_TRANSCRIPT_FILE_BYTES = 10 * 1024 * 1024;

export type CallDigestSessionDeps = {
  runWorkflow?: (input: CallDigestInput) => ActiveRun;
};

export function createCallDigestSessions(
  config: SlackCallDigestConfig,
  stderr: (text: string) => void,
  deps: CallDigestSessionDeps = {},
) {
  const awaitingTranscript = new Set<string>();
  const activeThreads = new Set<string>();
  const runWorkflow =
    deps.runWorkflow ??
    ((input: CallDigestInput) =>
      runLocal(defineInternalProcessing(config.source), {
        triggerPayload: JSON.stringify(input),
        invokeStep: createInternalProcessingStepInvoker({
          source: config.source,
          contextRoot: join(config.contextRoot, randomUUID()),
          log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        }),
      }));

  async function requestTranscript(
    threadId: string,
    thread: Thread,
    postIntake: () => Promise<void>,
  ): Promise<void> {
    if (activeThreads.has(threadId)) {
      await thread.post(
        statusCard(
          "Call digest already running",
          "Wait for the current digest before starting another in this thread.",
        ),
      );
      return;
    }
    if (awaitingTranscript.has(threadId)) {
      await thread.post(
        statusCard(
          "Waiting for transcript",
          "Upload the full call transcript as a `.txt` file in this thread.",
        ),
      );
      return;
    }

    awaitingTranscript.add(threadId);
    try {
      await postIntake();
    } catch (cause) {
      awaitingTranscript.delete(threadId);
      throw cause;
    }
  }

  async function acceptTranscriptFile(
    threadId: string,
    attachments: Attachment[],
    thread: Thread,
  ): Promise<void> {
    if (activeThreads.has(threadId)) {
      await thread.post(
        statusCard(
          "Call digest already running",
          "Wait for the current digest before uploading another transcript.",
        ),
      );
      return;
    }
    if (!awaitingTranscript.has(threadId)) return;

    const attachment = attachments.find(isTranscriptFile);
    if (attachment === undefined) {
      await thread.post(
        statusCard(
          "Transcript file needed",
          "Upload the full call transcript as a `.txt` file in this thread.",
        ),
      );
      return;
    }

    const input = await readTranscriptFile(attachment);
    if (input === undefined) {
      await thread.post(
        statusCard(
          "Could not read transcript file",
          "Upload a UTF-8 `.txt` transcript between 50 characters and 10 MB.",
        ),
      );
      return;
    }

    awaitingTranscript.delete(threadId);
    activeThreads.add(threadId);
    await start(input, thread, threadId);
  }

  async function start(
    input: CallDigestInput,
    thread: Thread,
    threadId: string,
  ): Promise<void> {
    const run = runWorkflow(input);

    try {
      await thread.post(
        statusCard(
          "Call digest started",
          `Run ${run.runId} is summarizing the transcript, then extracting companies and claims.`,
        ),
      );
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      await run.cancel("self", "failed to post workflow start").catch(() => {});
      activeThreads.delete(threadId);
      throw new Error(`Could not post the Slack digest status: ${detail}`, {
        cause,
      });
    }

    void followRun(run, thread, threadId);
  }

  async function followRun(
    run: ActiveRun,
    thread: Thread,
    threadId: string,
  ): Promise<void> {
    try {
      const result: RunResult = await run.complete;
      if (result.terminalStatus !== "completed") {
        await thread.post(
          statusCard(
            "Call digest ended",
            `Run status: ${result.terminalStatus}`,
          ),
        );
        return;
      }

      const parsed = parseCallDigest(result.outputs.extract);
      if (!parsed.ok) throw new Error(parsed.error);
      for (const card of callDigestCards(parsed.digest)) {
        await thread.post(card);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      await run.cancel("self", detail).catch(() => {});
      await thread
        .post(statusCard("Call digest failed", detail))
        .catch(() => {});
    } finally {
      activeThreads.delete(threadId);
      await thread.unsubscribe().catch(() => {});
    }
  }

  return { acceptTranscriptFile, requestTranscript };
}

function isTranscriptFile(attachment: Attachment): boolean {
  return (
    attachment.type === "file" &&
    attachment.name?.toLowerCase().endsWith(".txt") === true
  );
}

async function readTranscriptFile(
  attachment: Attachment,
): Promise<CallDigestInput | undefined> {
  if (attachment.fetchData === undefined) return undefined;
  if (
    attachment.size !== undefined &&
    attachment.size > MAX_TRANSCRIPT_FILE_BYTES
  ) {
    return undefined;
  }

  let bytes: Buffer;
  try {
    bytes = await attachment.fetchData();
  } catch {
    return undefined;
  }
  if (bytes.byteLength > MAX_TRANSCRIPT_FILE_BYTES) return undefined;

  const transcript = bytes.toString("utf8").trim();
  if (transcript.length < 50) return undefined;

  const filename = attachment.name ?? "Call transcript.txt";
  const callTitle = filename.slice(0, -".txt".length).trim();
  return {
    callTitle: (callTitle === "" ? "Call transcript" : callTitle).slice(0, 120),
    transcript,
  };
}
