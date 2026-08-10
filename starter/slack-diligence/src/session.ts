import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import { runLocal, type WorkflowRun } from "@intx/workflow";
import { WebClient } from "@slack/web-api";
import type { Thread } from "chat";

import { diligenceCard, statusCard } from "./cards";
import { SERVICE_NAME, type SlackDiligenceConfig } from "./config";
import { parseDiligenceBrief } from "./parser";
import { renderDiligencePdf } from "./pdf";
import { parseDiligenceInput } from "./request";
import { uploadDiligencePdf } from "./slack-upload";
import type { DiligenceRequest } from "./types";
import {
  createDiligenceStepInvoker,
  defineDiligenceWorkflow,
} from "./workflow";

type ActiveRun = {
  run: WorkflowRun;
  request: DiligenceRequest;
  thread: Thread;
};

export function createDiligenceSessions(
  config: SlackDiligenceConfig,
  stderr: (text: string) => void,
) {
  const active = new Map<string, ActiveRun>();
  const slack = new WebClient(config.botToken);

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    const input = parseDiligenceInput(event.text);
    if (input === undefined) {
      await thread.post(
        statusCard(
          "Company and website required",
          "Use: Company Name | https://company.example",
        ),
      );
      return;
    }
    if (active.has(thread.id)) {
      await thread.post(
        statusCard(
          "Diligence already running",
          "Wait for the current snapshot before starting another in this thread.",
        ),
      );
      return;
    }

    const request = { ...input, asOf: new Date().toISOString() };
    const run = runLocal(
      defineDiligenceWorkflow(config.sources, config.webResearch),
      {
        triggerPayload: request,
        invokeStep: createDiligenceStepInvoker({
          sources: config.sources,
          contextRoot: join(config.contextRoot, randomUUID()),
          log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        }),
      },
    );
    const current = { run, request, thread };
    active.set(thread.id, current);

    try {
      await thread.post(
        statusCard(
          "Diligence started",
          `Run \`${run.runId}\` is researching and drafting the sourced brief.`,
        ),
      );
    } catch (cause) {
      active.delete(thread.id);
      await run.cancel("self", "failed to post workflow start").catch(() => {});
      throw cause;
    }

    void followRun(current);
  }

  async function followRun(current: ActiveRun): Promise<void> {
    try {
      const result = await current.run.complete;
      if (result.terminalStatus !== "completed") {
        await current.thread.post(
          statusCard(
            "Diligence ended",
            `Run status: \`${result.terminalStatus}\``,
          ),
        );
        return;
      }

      const parsed = parseDiligenceBrief(
        result.outputs.draft,
        current.request,
      );
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      let pdfAttached = false;
      try {
        const pdf = await renderDiligencePdf(parsed.brief);
        await uploadDiligencePdf(
          slack,
          current.thread.id,
          parsed.brief,
          pdf,
        );
        pdfAttached = true;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        stderr(`${SERVICE_NAME}: PDF upload failed: ${detail}\n`);
      }

      await current.thread.post(
        diligenceCard(parsed.brief, { pdfAttached }),
      );
      if (!pdfAttached) {
        await current.thread.post(
          statusCard(
            "PDF upload failed",
            "The Slack snapshot is still available.",
          ),
        );
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      await current.run.cancel("self", detail).catch(() => {});
      await current.thread
        .post(statusCard("Diligence failed", detail))
        .catch(() => {});
    } finally {
      if (active.get(current.thread.id) === current) {
        active.delete(current.thread.id);
      }
    }
  }

  return { start };
}
