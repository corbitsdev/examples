import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  runLocal,
  type RunResult,
  type WorkflowRun,
} from "@intx/workflow";
import {
  createSlackFileFetcher,
  type SlackFileFetcher,
  type TagAttachment,
  type TagThread,
} from "corbits-tag/slack";

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
const MRKDWN_POST = { convertMarkdown: false } as const;

export type CallDigestSessionDeps = {
  runWorkflow?: (input: CallDigestInput) => ActiveRun;
  fetchFile?: SlackFileFetcher;
};

export function createCallDigestSessions(
  config: SlackCallDigestConfig,
  stderr: (text: string) => void,
  deps: CallDigestSessionDeps = {},
) {
  const awaitingTranscript = new Set<string>();
  const activeThreads = new Set<string>();
  const fetchFile =
    deps.fetchFile ?? createSlackFileFetcher(config.botToken);
  const runWorkflow =
    deps.runWorkflow ??
    ((input: CallDigestInput) =>
      runLocal(defineInternalProcessing(config.source), {
        triggerPayload: input,
        invokeStep: createInternalProcessingStepInvoker({
          source: config.source,
          contextRoot: join(config.contextRoot, randomUUID()),
          log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        }),
      }));

  async function requestTranscript(
    threadId: string,
    thread: TagThread,
    postIntake: () => Promise<void>,
  ): Promise<void> {
    if (activeThreads.has(threadId)) {
      await thread.post(
        statusCard(
          "Call digest already running",
          "Wait for the current digest before starting another in this thread.",
        ),
        MRKDWN_POST,
      );
      return;
    }
    if (awaitingTranscript.has(threadId)) {
      await thread.post(
        statusCard(
          "Waiting for transcript",
          "Upload the full call transcript as a `.txt` file in this thread.",
        ),
        MRKDWN_POST,
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
    attachments: readonly TagAttachment[],
    thread: TagThread,
  ): Promise<void> {
    if (activeThreads.has(threadId)) {
      await thread.post(
        statusCard(
          "Call digest already running",
          "Wait for the current digest before uploading another transcript.",
        ),
        MRKDWN_POST,
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
        MRKDWN_POST,
      );
      return;
    }

    const input = await readTranscriptFile(attachment, fetchFile);
    if (input === undefined) {
      await thread.post(
        statusCard(
          "Could not read transcript file",
          "Upload a UTF-8 `.txt` transcript between 50 characters and 10 MB.",
        ),
        MRKDWN_POST,
      );
      return;
    }

    awaitingTranscript.delete(threadId);
    activeThreads.add(threadId);
    await start(input, thread, threadId);
  }

  async function start(
    input: CallDigestInput,
    thread: TagThread,
    threadId: string,
  ): Promise<void> {
    const run = runWorkflow(input);

    try {
      await thread.post(
        statusCard(
          "Call digest started",
          `Run ${run.runId} is summarizing the transcript, then extracting companies and claims.`,
        ),
        MRKDWN_POST,
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
    thread: TagThread,
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
          MRKDWN_POST,
        );
        return;
      }

      const parsed = parseCallDigest(result.outputs.extract);
      if (!parsed.ok) throw new Error(parsed.error);
      for (const card of callDigestCards(parsed.digest)) {
        await thread.post(card, MRKDWN_POST);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      await run.cancel("self", detail).catch(() => {});
      await thread
        .post(statusCard("Call digest failed", detail), MRKDWN_POST)
        .catch(() => {});
    } finally {
      activeThreads.delete(threadId);
    }
  }

  return { acceptTranscriptFile, requestTranscript };
}

function isTranscriptFile(attachment: TagAttachment): boolean {
  return attachment.name.toLowerCase().endsWith(".txt");
}

async function readTranscriptFile(
  attachment: TagAttachment,
  fetchFile: SlackFileFetcher,
): Promise<CallDigestInput | undefined> {
  if (attachment.url === undefined) return undefined;
  if (
    attachment.size !== undefined &&
    attachment.size > MAX_TRANSCRIPT_FILE_BYTES
  ) {
    return undefined;
  }

  let bytes: Buffer;
  try {
    const response = await fetchFile(attachment.url);
    if (!response.ok) return undefined;
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return undefined;
  }
  if (bytes.byteLength > MAX_TRANSCRIPT_FILE_BYTES) return undefined;

  const transcript = bytes.toString("utf8").trim();
  if (transcript.length < 50) return undefined;

  const filename = attachment.name;
  const callTitle = filename.slice(0, -".txt".length).trim();
  return {
    callTitle: (callTitle === "" ? "Call transcript" : callTitle).slice(0, 120),
    transcript,
  };
}
