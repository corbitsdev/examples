// workflow-quickstart: the smallest runnable @intx/workflow program.
//
// This file is just the entry point — parse the topic, pick a provider,
// run the workflow, print the result. The workflow itself lives in
// ./workflow.ts; that is the file to read.
//
// runLocal supplies in-memory implementations of the repo store,
// scheduler, signal channel, and blob substrate, then drives the same
// runtime body a production host would.
//
// NOTE ON DEPENDENCIES: @intx/workflow is not published to npm yet, so
// this example resolves @intx/* from the `interchange` git submodule at
// the repo root, via a bun workspace. See the README. Once it ships to
// npm this swaps to a normal dependency.

import { join } from "node:path";

import { runLocal } from "@intx/workflow";

import { resolveSource } from "./source";
import {
  WORKFLOW_ID,
  createInvokeStep,
  defineDraftReviewWorkflow,
} from "./workflow";

export type MainOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  contextDir?: string;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  opts: MainOptions = {},
): Promise<number> {
  const stdout = opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr = opts.stderr ?? ((text: string) => void process.stderr.write(text));

  const topic = argv.join(" ").trim();
  if (topic === "") {
    stderr("usage: bun run start <topic>\n");
    return 1;
  }

  // Pick a provider from the environment — Anthropic, OpenAI, an
  // OpenAI-compatible endpoint, or Google Gemini. See ./source.ts; the
  // workflow never names a vendor.
  const resolved = resolveSource(env);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }
  const source = resolved.source;

  const contextRoot =
    opts.contextDir ?? join(process.cwd(), "tmp", WORKFLOW_ID);

  const definition = defineDraftReviewWorkflow(source);
  const invokeStep = createInvokeStep({
    source,
    contextRoot,
    log: (line) => stderr(line + "\n"),
  });

  // Progress goes to stderr so stdout stays the workflow's result.
  stderr(`workflow ${WORKFLOW_ID} · ${source.provider}/${source.model}\n`);
  const run = runLocal(definition, { triggerPayload: topic, invokeStep });
  const result = await run.complete;
  stderr(`workflow ${WORKFLOW_ID} · ${result.terminalStatus}\n\n`);

  stdout(`draft:  ${String(result.outputs.draft ?? "")}\n`);
  stdout(`review: ${String(result.outputs.review ?? "")}\n`);

  return result.terminalStatus === "completed" ? 0 : 1;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
