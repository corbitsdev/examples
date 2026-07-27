// workflow-approval-flow: draft -> approval signal -> publish.
//
// The CLI keeps final outputs on stdout and asks the local operator to
// approve or reject the run before the publish step can execute.

import { createInterface } from "node:readline/promises";
import { join } from "node:path";

import {
  runLocal,
  type WorkflowAuthorizeFn,
  type WorkflowRun,
} from "@intx/workflow";

import { resolveSource } from "./source";
import {
  APPROVAL_SIGNAL,
  WORKFLOW_ID,
  createInvokeStep,
  defineApprovalFlow,
} from "./workflow";

export type MainOptions = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  contextDir?: string;
};

type ParsedArgs = {
  prompt: string;
  autoApprove: boolean;
  reject: boolean;
};

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  opts: MainOptions = {},
): Promise<number> {
  const stdout =
    opts.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr =
    opts.stderr ?? ((text: string) => void process.stderr.write(text));

  if (argv.includes("--help") || argv.includes("-h")) {
    stdout(
      [
        "usage: bun run start [--auto-approve | --reject] <request>",
        "",
        "Run the local human-in-the-loop approval workflow.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const parsed = parseArgs(argv);
  if (parsed.prompt === "") {
    stderr(
      "usage: bun run start [--auto-approve | --reject] <request>\n",
    );
    return 1;
  }

  const resolved = resolveSource(env);
  if (resolved.error !== undefined) {
    stderr(resolved.error);
    return 1;
  }
  const source = resolved.source;
  const contextRoot =
    opts.contextDir ?? join(process.cwd(), "tmp", WORKFLOW_ID);
  const ui = createCliUi(stderr);

  let draftOutput = "";
  let markDraftReady: () => void = () => undefined;
  const draftReady = new Promise<void>((resolve) => {
    markDraftReady = resolve;
  });
  const authorize = createLoggingAuthorize(ui);
  const definition = defineApprovalFlow(source);
  const invokeStep = createInvokeStep({
    source,
    contextRoot,
    authorize,
    log: ui.log,
    onStepDone: (stepId, output) => {
      if (stepId === "draft") {
        draftOutput = output;
        markDraftReady();
      }
    },
  });

  ui.header(WORKFLOW_ID, `${source.provider}/${source.model}`);
  ui.stage(1, "Drafting");
  const run = runLocal(definition, {
    triggerPayload: parsed.prompt,
    invokeStep,
    authorize,
  });
  ui.runStarted(run.runId);

  const approvalCode = await driveApproval(
    run,
    parsed,
    ui,
    draftReady,
    () => draftOutput,
  );
  const result = await run.complete;
  ui.finished(result.terminalStatus);

  if (result.terminalStatus === "completed") {
    stdout(`Published output:\n\n${String(result.outputs.publish ?? "")}\n`);
  } else {
    stdout(`Draft output:\n\n${String(result.outputs.draft ?? "")}\n`);
  }

  if (approvalCode !== 0) return approvalCode;
  return result.terminalStatus === "completed" ? 0 : 1;
}

function parseArgs(argv: string[]): ParsedArgs {
  const rest: string[] = [];
  let autoApprove = false;
  let reject = false;

  for (const arg of argv) {
    switch (arg) {
      case "--auto-approve":
        autoApprove = true;
        break;
      case "--reject":
        reject = true;
        break;
      default:
        rest.push(arg);
        break;
    }
  }

  return { prompt: rest.join(" ").trim(), autoApprove, reject };
}

type CliUi = {
  header: (workflowId: string, model: string) => void;
  stage: (index: 1 | 2 | 3, label: string) => void;
  runStarted: (runId: string) => void;
  log: (line: string) => void;
  draftReady: (draft: string) => void;
  approved: (reason: string) => void;
  rejected: (reason: string) => void;
  prompt: () => void;
  finished: (status: string) => void;
};

function createCliUi(stderr: (text: string) => void): CliUi {
  const divider = "-".repeat(72);
  return {
    header: (workflowId, model) => {
      stderr("\nApproval Workflow\n");
      stderr(`${divider}\n`);
      stderr(`Workflow: ${workflowId}\n`);
      stderr(`Model:    ${model}\n\n`);
    },
    stage: (index, label) => {
      stderr(`[${index}/3] ${label}\n`);
    },
    runStarted: (runId) => {
      stderr(`  - run: ${runId}\n`);
    },
    log: (line) => {
      stderr(`  - ${line}\n`);
    },
    draftReady: (draft) => {
      stderr("\n[2/3] Waiting for approval\n");
      stderr("Draft ready:\n\n");
      stderr(`${divider}\n`);
      stderr(`${draft.trim()}\n`);
      stderr(`${divider}\n\n`);
    },
    approved: (reason) => {
      stderr(`Approved (${reason}).\n\n`);
      stderr("[3/3] Publishing\n");
    },
    rejected: (reason) => {
      stderr(`Rejected (${reason}).\n\n`);
    },
    prompt: () => {
      stderr(
        'Approve this draft? Type "approve" to publish or "reject" to cancel.\n',
      );
    },
    finished: (status) => {
      stderr(`\nWorkflow ${status}.\n\n`);
    },
  };
}

function createLoggingAuthorize(ui: CliUi): WorkflowAuthorizeFn {
  return async (resource, action, context) => {
    ui.log(
      `policy check: ${context.stepId ?? "workflow"} can ${action} ${resource}`,
    );
    return {
      effect: "allow",
      matchingGrants: [
        {
          id: "local-operator-grant",
          resource,
          action,
          effect: "allow",
          origin: "invoker",
          specificity: 100,
        },
      ],
      resolvedBy: {
        id: "local-operator-grant",
        resource,
        action,
        effect: "allow",
        origin: "invoker",
        specificity: 100,
      },
    };
  };
}

async function driveApproval(
  run: WorkflowRun,
  parsed: ParsedArgs,
  ui: CliUi,
  draftReady: Promise<void>,
  getDraft: () => string,
): Promise<number> {
  await Promise.race([draftReady, run.complete.then(() => undefined)]);
  const draft = getDraft();
  if (draft !== "") ui.draftReady(draft);

  if (parsed.reject) {
    ui.rejected("--reject");
    await run.cancel("supervisor-operator", "rejected by local operator");
    return 2;
  }

  if (parsed.autoApprove) {
    ui.approved("--auto-approve");
    await run.signal(APPROVAL_SIGNAL, {
      approvedBy: "local-cli",
      approvedAt: new Date().toISOString(),
    });
    return 0;
  }

  ui.prompt();
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    for (;;) {
      const answer = (await rl.question("approval> ")).trim().toLowerCase();
      if (answer === "approve" || answer === "approved" || answer === "yes") {
        ui.approved("local operator");
        await run.signal(APPROVAL_SIGNAL, {
          approvedBy: "local-cli",
          approvedAt: new Date().toISOString(),
        });
        return 0;
      }
      if (answer === "reject" || answer === "rejected" || answer === "no") {
        ui.rejected("local operator");
        await run.cancel("supervisor-operator", "rejected by local operator");
        return 2;
      }
      ui.log('type "approve" or "reject"');
    }
  } finally {
    rl.close();
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2), process.env);
  if (code !== 0) process.exit(code);
}
