import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { TagEvent } from "@corbits/tag-slack";
import { runLocal, type WorkflowRun } from "@intx/workflow";
import type { Thread } from "chat";

import { factCheckCard, statusCard } from "./cards";
import { SERVICE_NAME, type SlackFactCheckConfig } from "./config";
import { parseFactCheckReport } from "./parser";
import { createFactCheckStepInvoker, defineScoutFactCheck } from "./workflow";

type ActiveRun = {
  run: WorkflowRun;
  thread: Thread;
};

export function createFactCheckSessions(
  config: SlackFactCheckConfig,
  stderr: (text: string) => void,
) {
  const active = new Map<string, ActiveRun>();

  async function start(event: TagEvent, thread: Thread): Promise<void> {
    if (active.has(thread.id)) {
      await thread.post(
        statusCard(
          "Fact check already running",
          "Wait for the current report before starting another in this thread.",
        ),
      );
      return;
    }

    const run = runLocal(
      defineScoutFactCheck(config.source, config.webResearch),
      {
        triggerPayload: event.text,
        invokeStep: createFactCheckStepInvoker({
          source: config.source,
          contextRoot: join(config.contextRoot, randomUUID()),
          log: (line) => stderr(`${SERVICE_NAME}: ${line}\n`),
        }),
      },
    );
    const current = { run, thread };
    active.set(thread.id, current);

    try {
      await thread.post(
        statusCard(
          "Fact check started",
          `Run \`${run.runId}\` is extracting and verifying claims.`,
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
            "Fact check ended",
            `Run status: \`${result.terminalStatus}\``,
          ),
        );
        return;
      }

      const parsed = parseFactCheckReport(result.outputs.verify);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await current.thread.post(factCheckCard(parsed.report));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      stderr(`${SERVICE_NAME}: workflow failed: ${detail}\n`);
      await current.run.cancel("self", detail).catch(() => {});
      await current.thread
        .post(statusCard("Fact check failed", detail))
        .catch(() => {});
    } finally {
      if (active.get(current.thread.id) === current) {
        active.delete(current.thread.id);
      }
    }
  }

  return { start };
}
