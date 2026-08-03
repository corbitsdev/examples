import { expect, test } from "bun:test";

import type { TagEvent } from "@corbits/tag-slack";
import type { RunResult } from "@intx/workflow";
import type { CardElement, SentMessage, Thread } from "chat";

import type { TeamGrillConfig } from "./config";
import { createTeamGrillSessions } from "./session";

const config: TeamGrillConfig = {
  port: 3001,
  signingSecret: "secret",
  botToken: "xoxb-test",
  source: {
    id: "test",
    provider: "openai-compatible",
    baseURL: "https://example.com/v1",
    apiKey: "test",
    model: "test",
  },
  contextRoot: "/tmp/team-grill-test",
};

test("delivers the final report before run.complete settles", async () => {
  const posts: Array<string | CardElement> = [];
  const cancellations: string[] = [];
  const logs: string[] = [];
  let runs = 0;
  const sessions = createTeamGrillSessions(
    config,
    (line) => logs.push(line),
    {
      runWorkflow: (_input, hooks) => {
        runs += 1;
        hooks.onStepDone("generate", { needsQuestion: false });
        hooks.onStepDone("report", {
          conclusion: "The selected decisions form a coherent direction.",
          openItems: [],
        });
        return {
          runId: `report-run-${String(runs)}`,
          complete: new Promise<RunResult>(() => undefined),
          async signal() {},
          async cancel(_origin, reason) {
            cancellations.push(reason);
          },
        };
      },
    },
  );

  const thread = {
    id: "thread-1",
    post: async (content: string | CardElement) => {
      posts.push(content);
      return { id: `message-${String(posts.length)}` } as SentMessage;
    },
  } as Thread;
  await sessions.start(tagEvent(), thread);

  expect(cardTitle(posts[0])).toBe("Grill complete");
  expect(cancellations).toEqual([
    "Final report delivered before the local run settled",
  ]);
  expect(logs.join("")).toContain("final summary posted");

  await sessions.start(tagEvent(), thread);
  expect(runs).toBe(2);
});

function tagEvent(): TagEvent {
  return {
    platform: "slack",
    threadId: "thread-1",
    text: "Grill this request",
    author: {
      userId: "U123",
      userName: "pratik",
      fullName: "Pratik",
      isBot: false,
      emailVerified: "unknown",
      isRestricted: "unknown",
    },
    isMention: true,
    trigger: "mention",
  };
}

function cardTitle(content: string | CardElement | undefined): string | undefined {
  return typeof content === "string" ? undefined : content?.title;
}
