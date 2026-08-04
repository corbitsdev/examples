import type { TagEvent, TagThread } from "@corbits/tag-slack";
import { runLocal, type RunResult } from "@intx/workflow";

import { SERVICE_NAME, type CommunityPulseConfig } from "./config";
import type { Period, PulseTarget } from "./types";
import {
  createAgentStepInvoker,
  defineCommunityPulseWorkflow,
} from "./workflow";

export function createCommunityPulseSessions(
  config: CommunityPulseConfig,
  stderr: (text: string) => void,
) {
  const active = new Set<string>();

  async function start(event: TagEvent, thread: TagThread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post("*A weekly pulse is already running in this thread.*");
      return;
    }

    active.add(thread.id);
    try {
      await thread.post(
        ":hourglass_flowing_sand: *Building the weekly community pulse…*",
      );
    } catch (error) {
      active.delete(thread.id);
      throw error;
    }

    void run(event.text, thread).finally(() => active.delete(thread.id));
  }

  async function run(request: string, thread: TagThread): Promise<void> {
    try {
      const username = resolveUsername(request, config.defaultHandle);
      const { current, previous } = periods(new Date());
      const target: PulseTarget = {
        username,
        currentPeriod: current,
        previousPeriod: previous,
      };
      const workflow = runLocal(defineCommunityPulseWorkflow(config.source), {
        triggerPayload: target,
        invokeStep: createAgentStepInvoker({
          source: config.source,
          xClient: config.xClient,
          contextRoot: config.contextRoot,
          log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        }),
      });
      const result = await workflow.complete;
      await thread.post(completedReport(result));
    } catch (error) {
      const detail = message(error);
      stderr(`${SERVICE_NAME}: ${detail}\n`);
      await thread
        .post(`:warning: *Weekly pulse failed*\n${escape(detail).slice(0, 1_000)}`)
        .catch(() => {});
    }
  }

  return { start };
}

function completedReport(result: RunResult): string {
  if (result.terminalStatus !== "completed") {
    const failure = result.events.findLast(
      (event) => event.kind === "StepFailed",
    );
    throw new Error(
      failure?.kind === "StepFailed"
        ? failure.error.message
        : `Workflow ended with ${result.terminalStatus}`,
    );
  }
  const report = result.outputs.report;
  if (typeof report !== "string" || report.trim() === "") {
    throw new Error("Report step returned no text");
  }
  return `${report.trim()}\n\n_Corbits run: ${result.runId}_`;
}

function resolveUsername(request: string, fallback?: string): string {
  const text = request.replace(/<@[A-Z0-9]+>/giu, " ");
  const match =
    /(?:https?:\/\/(?:www\.)?x\.com\/)([A-Za-z0-9_]{1,15})/iu.exec(text) ??
    /(?:^|\s)@([A-Za-z0-9_]{1,15})(?=\s|$|[.,!?;:])/u.exec(text);
  const username = match?.[1] ?? fallback;
  if (!username) {
    throw new Error(
      "Include an X handle such as @corbitsdev, or set X_COMMUNITY_HANDLE.",
    );
  }
  return username;
}

function periods(end: Date): { current: Period; previous: Period } {
  const currentEnd = end.toISOString();
  const currentStart = new Date(end.getTime() - 7 * 86_400_000);
  const previousStart = new Date(currentStart.getTime() - 7 * 86_400_000);
  return {
    current: { start: currentStart.toISOString(), end: currentEnd },
    previous: {
      start: previousStart.toISOString(),
      end: currentStart.toISOString(),
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
