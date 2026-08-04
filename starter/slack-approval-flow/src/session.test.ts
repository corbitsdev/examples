import { expect, mock, test } from "bun:test";

import type { TagEvent } from "@corbits/tag-slack";
import type { RunResult, WorkflowRun } from "@intx/workflow";
import type { ActionEvent, SentMessage, Thread } from "chat";

import { APPROVE_ACTION_ID } from "./cards";
import type { SlackWorkflowConfig } from "./config";
import { createApprovalSessions } from "./session";

const config = {} as SlackWorkflowConfig;
const event = { text: "write a launch note" } as TagEvent;

test("a failed draft is reported, cleared, and allows another start", async () => {
  const thread = createThread();
  const stderr: string[] = [];
  const first = createRun("run-1", false);
  const second = createRun("run-2");
  const runs = [first, second];
  let starts = 0;
  const sessions = createApprovalSessions(config, (text) => stderr.push(text), {
    startRun: (_request, draft) => {
      const current = runs[starts++];
      if (current === undefined) throw new Error("unexpected start");
      if (starts === 1) draft.failed(new Error("draft exploded"));
      else draft.ready("replacement draft");
      return current.run;
    },
  });

  await sessions.start(event, thread.value);
  await waitUntil(() => first.cancel.mock.calls.length === 1);

  expect(stderr.join("")).toContain("draft exploded");
  expect(JSON.stringify(thread.posts)).toContain("Workflow failed");

  await sessions.start(event, thread.value);
  await waitUntil(() => thread.posts.length === 4);
  expect(starts).toBe(2);

  second.finish.resolve(result("run-2", "cancelled"));
});

test("a draft timeout cancels and clears the run", async () => {
  const thread = createThread();
  const stderr: string[] = [];
  const current = createRun("run-timeout");
  const sessions = createApprovalSessions(config, (text) => stderr.push(text), {
    draftTimeoutMs: 1,
    startRun: () => current.run,
  });

  await sessions.start(event, thread.value);
  await waitUntil(() => current.cancel.mock.calls.length === 1);

  expect(current.cancel.mock.calls[0]?.[0]).toBe("self");
  expect(stderr.join("")).toContain("one minute");
  expect(JSON.stringify(thread.posts)).toContain("Workflow failed");
});

test("a stale action gets ephemeral feedback without touching the live run", async () => {
  const thread = createThread();
  const current = createRun("run-current");
  const sessions = createApprovalSessions(config, () => {}, {
    startRun: (_request, draft) => {
      draft.ready("current draft");
      return current.run;
    },
  });

  await sessions.start(event, thread.value);
  await waitUntil(() => thread.posts.length === 2);
  const publicPostCount = thread.posts.length;

  await sessions.decide({
    actionId: APPROVE_ACTION_ID,
    thread: thread.value,
    threadId: thread.value.id,
    user: {
      userId: "U123",
      userName: "pratik",
      fullName: "Pratik",
      isBot: false,
      isMe: false,
    },
    value: "run-stale",
  } as ActionEvent);

  expect(thread.ephemeral).toEqual([
    {
      message: "This approval is no longer active.",
      userId: "U123",
      fallbackToDM: false,
    },
  ]);
  expect(thread.posts.length).toBe(publicPostCount);
  expect(current.signal).not.toHaveBeenCalled();
  expect(current.cancel).not.toHaveBeenCalled();

  current.finish.resolve(result("run-current", "cancelled"));
});

function createRun(runId: string, cancelSettles = true) {
  const finish = Promise.withResolvers<RunResult>();
  const cancel = mock(
    async (
      _origin: "self" | "supervisor-operator",
      _reason: string,
    ) => {
      if (!cancelSettles) return await new Promise<void>(() => undefined);
      finish.resolve(result(runId, "cancelled"));
    },
  );
  const signal = mock(
    async (_name: string, _payload: unknown, _signalId?: string) => {},
  );
  const run: WorkflowRun = {
    runId,
    complete: finish.promise,
    cancel,
    signal,
  };
  return { run, finish, cancel, signal };
}

function createThread(id = "thread-1") {
  const posts: unknown[] = [];
  const ephemeral: Array<{
    message: unknown;
    userId: string;
    fallbackToDM: boolean;
  }> = [];
  const sent = { edit: mock(async () => {}) } as unknown as SentMessage;
  const value = {
    id,
    post: mock(async (message: unknown) => {
      posts.push(message);
      return sent;
    }),
    postEphemeral: mock(
      async (
        user: { userId: string },
        message: unknown,
        options: { fallbackToDM: boolean },
      ) => {
        ephemeral.push({
          message,
          userId: user.userId,
          fallbackToDM: options.fallbackToDM,
        });
        return {};
      },
    ),
  } as unknown as Thread;
  return { value, posts, ephemeral };
}

function result(
  runId: string,
  terminalStatus: RunResult["terminalStatus"],
): RunResult {
  return { runId, terminalStatus, outputs: {}, events: [] };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await Bun.sleep(1);
  }
  throw new Error("condition was not met");
}
