import { describe, expect, test } from "bun:test";

import type { RunResult } from "@intx/workflow";
import type { Attachment, CardElement, SentMessage, Thread } from "chat";

import type { SlackCallDigestConfig } from "./config";
import { createCallDigestSessions } from "./session";
import type { CallDigestInput } from "./types";

const config: SlackCallDigestConfig = {
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
  contextRoot: "/tmp/slack-internal-processing-test",
};

function makeThread(id: string, posts: Array<string | CardElement>): Thread {
  return {
    id,
    post: async (content: string | CardElement) => {
      posts.push(content);
      return { id: `message-${String(posts.length)}` } as SentMessage;
    },
    unsubscribe: async () => {},
  } as Thread;
}

function completedRun(outputs: Record<string, unknown>) {
  return {
    runId: "run-1",
    complete: Promise.resolve({
      terminalStatus: "completed",
      outputs,
    } as RunResult),
    cancel: async () => {},
  };
}

describe("createCallDigestSessions", () => {
  test("posts when mentioned again while awaiting a transcript", async () => {
    const posts: Array<string | CardElement> = [];
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t1", posts);

    await sessions.requestTranscript("t1", thread, async () => {
      posts.push("intake");
    });
    await sessions.requestTranscript("t1", thread, async () => {
      posts.push("should-not-appear");
    });

    expect(posts[0]).toBe("intake");
    expect(JSON.stringify(posts[1])).toContain("Waiting for transcript");
    expect(posts).not.toContain("should-not-appear");
  });

  test("prompts when the attachment is not a txt file", async () => {
    const posts: Array<string | CardElement> = [];
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t2", posts);

    await sessions.requestTranscript("t2", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t2",
      [{ type: "file", name: "notes.pdf" } as Attachment],
      thread,
    );

    expect(JSON.stringify(posts[0])).toContain("Transcript file needed");
  });

  test("rejects oversized files after download when size is omitted", async () => {
    const posts: Array<string | CardElement> = [];
    let fetched = false;
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t3", posts);

    await sessions.requestTranscript("t3", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t3",
      [
        {
          type: "file",
          name: "big.txt",
          fetchData: async () => {
            fetched = true;
            return Buffer.alloc(11 * 1024 * 1024, 0x61);
          },
        } as Attachment,
      ],
      thread,
    );

    expect(fetched).toBe(true);
    expect(JSON.stringify(posts[0])).toContain("Could not read transcript file");
  });

  test("derives the call title from the filename", async () => {
    const inputs: CallDigestInput[] = [];
    const posts: Array<string | CardElement> = [];
    const sessions = createCallDigestSessions(config, () => {}, {
      runWorkflow: (input) => {
        inputs.push(input);
        return completedRun({
          extract: {
            callTitle: input.callTitle,
            summary: "s",
            discussionPoints: ["d"],
            companies: [],
            claims: [],
          },
        });
      },
    });
    const thread = makeThread("t4", posts);

    await sessions.requestTranscript("t4", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t4",
      [
        {
          type: "file",
          name: "acme-investor-call.txt",
          size: 100,
          fetchData: async () => Buffer.from("y".repeat(60)),
        } as Attachment,
      ],
      thread,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(inputs[0]?.callTitle).toBe("acme-investor-call");
  });

  test("rejects transcripts shorter than 50 characters", async () => {
    const posts: Array<string | CardElement> = [];
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t5", posts);

    await sessions.requestTranscript("t5", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t5",
      [
        {
          type: "file",
          name: "short.txt",
          size: 10,
          fetchData: async () => Buffer.from("   too short   "),
        } as Attachment,
      ],
      thread,
    );

    expect(JSON.stringify(posts[0])).toContain("Could not read transcript file");
  });
});
