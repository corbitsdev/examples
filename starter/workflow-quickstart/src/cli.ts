// workflow-quickstart: the smallest runnable @intx/workflow program.
//
// Where agent-quickstart answers "what is the minimum code to talk to
// one agent?", this answers "what is the minimum code to define a
// multi-step agent *workflow* and run it?". The body of main() below
// is the whole story: define two agents, wire them into a two-step
// workflow with defineWorkflow + step, drive it with runLocal, await
// the terminal result, print the captured outputs.
//
// The workflow is a linear draft -> review chain: step `draft` reads
// the trigger payload (a topic) and writes a paragraph; step `review`
// reads `draft`'s output and tightens it. Step inputs are wired with
// path selectors -- `{ from: "trigger.payload" }` and
// `{ from: "steps.draft.output" }` -- which is how a step reads the
// run's trigger and an upstream step's output.
//
// runLocal supplies in-memory implementations of the repo store,
// scheduler, signal channel, and blob substrate, then drives the same
// runtime body a production host would. By default it stubs each step
// to `{ output: null }`; to do *real* inference we pass an
// `invokeStep` (a StepInvoker) that wraps createAgent / agent.send,
// the exact surface agent-quickstart uses.
//
// NOTE ON DEPENDENCIES: @intx/workflow is not published to npm yet, so
// unlike agent-quickstart this example resolves @intx/* from the
// `interchange` git submodule at the repo root, via a bun workspace.
// See the README. Once @intx/workflow ships to npm this swaps to a
// normal dependency and the submodule/workspace can go away.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore, permissiveAuthorize } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";
import { defineWorkflow, runLocal, step, type StepInvoker } from "@intx/workflow";

import { resolveSource } from "./source";

const EXAMPLE_NAME = "workflow-quickstart";

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
  // OpenAI-compatible endpoint, or Google Gemini. See ./source.ts for
  // the env conventions; the workflow below never names a vendor.
  const resolved = resolveSource(env);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }
  const source = resolved.source;

  // Two agent definitions, one per step. The workflow runtime hands
  // each definition to invokeStep, which instantiates it with
  // createAgent. inference.sources carries only the provider/model
  // preference; the concrete source (with baseURL/apiKey) is supplied
  // through the env at instantiation, matching agent-quickstart.
  const writer = defineAgent({
    id: "draft",
    systemPrompt:
      "You are a writer. Given a topic, write one tight, vivid paragraph about it. Output only the paragraph.",
    tools: [],
    capabilities: [],
    inference: { sources: [{ provider: source.provider, model: source.model }] },
  });
  const editor = defineAgent({
    id: "review",
    systemPrompt:
      "You are an editor. Given a paragraph, return a single sharper sentence that captures it. Output only the sentence.",
    tools: [],
    capabilities: [],
    inference: { sources: [{ provider: source.provider, model: source.model }] },
  });

  const definition = defineWorkflow({
    id: EXAMPLE_NAME,
    trigger: { type: "manual" },
    steps: {
      draft: step({ agent: writer, input: { from: "trigger.payload" } }),
      review: step({
        agent: editor,
        input: { from: "steps.draft.output" },
        after: ["draft"],
      }),
    },
  });

  const contextRoot =
    opts.contextDir ?? join(process.cwd(), "tmp", EXAMPLE_NAME);

  // The step runner. The runtime resolves each step's `input` selector,
  // then calls this with the step's agent definition and that input.
  // We instantiate the agent against a per-step context dir (its own
  // isogit-backed store + lock) and send the materialized input as the
  // prompt. The returned `output` becomes `steps.<id>.output`, which is
  // what the next step's selector reads.
  const invokeStep: StepInvoker = async ({ agent, input }) => {
    // One context dir (isogit store + lock) per agent id. Safe here
    // because `draft` and `review` are distinct agents running in
    // sequence. If you reuse one agent definition across steps that can
    // run concurrently, key the workdir on something unique per step so
    // they don't contend for the same lock.
    const workdir = join(contextRoot, agent.id);
    mkdirSync(workdir, { recursive: true });
    const storage = await createIsogitStore(workdir);

    const agentEnv: BaseEnv = {
      sources: [source],
      defaultSource: source.id,
      storage,
      workdir,
      audit: noopAuditStore(),
      authorize: permissiveAuthorize(),
      directors: createDefaultDirectorRegistry(),
    };

    const runtimeAgent = await createAgent(agent, agentEnv);
    try {
      const prompt = typeof input === "string" ? input : JSON.stringify(input);
      const { reply } = await runtimeAgent.send(prompt);
      return { output: reply };
    } finally {
      await runtimeAgent.close();
    }
  };

  const run = runLocal(definition, { triggerPayload: topic, invokeStep });
  const result = await run.complete;

  stdout(`status: ${result.terminalStatus}\n`);
  stdout(`draft:  ${String(result.outputs.draft ?? "")}\n`);
  stdout(`review: ${String(result.outputs.review ?? "")}\n`);

  return result.terminalStatus === "completed" ? 0 : 1;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
