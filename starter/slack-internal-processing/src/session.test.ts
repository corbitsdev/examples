import { describe, expect, test } from "bun:test";

import type { RunResult } from "@intx/workflow";
import type { TagAttachment, TagThread } from "corbits-tag/slack";

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

const slackFileUrl = "https://files.slack.com/files-pri/T/F/transcript.txt";

function makeThread(id: string, posts: string[]): TagThread {
  return {
    id,
    post: async (content: string) => {
      posts.push(content);
    },
    subscribe: async () => {},
  };
}

function fileResponse(body: Buffer, status = 200): Response {
  return new Response(body, { status });
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
    const posts: string[] = [];
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t1", posts);

    await sessions.requestTranscript("t1", thread, async () => {
      posts.push("intake");
    });
    await sessions.requestTranscript("t1", thread, async () => {
      posts.push("should-not-appear");
    });

    expect(posts[0]).toBe("intake");
    expect(posts[1]).toContain("Waiting for transcript");
    expect(posts).not.toContain("should-not-appear");
  });

  test("prompts when the attachment is not a txt file", async () => {
    const posts: string[] = [];
    const sessions = createCallDigestSessions(config, () => {});
    const thread = makeThread("t2", posts);

    await sessions.requestTranscript("t2", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t2",
      [{ id: "F1", name: "notes.pdf", mimeType: "application/pdf" }],
      thread,
    );

    expect(posts[0]).toContain("Transcript file needed");
  });

  test("rejects oversized files after download when size is omitted", async () => {
    const posts: string[] = [];
    let fetched = false;
    const sessions = createCallDigestSessions(config, () => {}, {
      fetchFile: async () => {
        fetched = true;
        return fileResponse(Buffer.alloc(11 * 1024 * 1024, 0x61));
      },
    });
    const thread = makeThread("t3", posts);

    await sessions.requestTranscript("t3", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t3",
      [
        {
          id: "F2",
          name: "big.txt",
          mimeType: "text/plain",
          url: slackFileUrl,
        } satisfies TagAttachment,
      ],
      thread,
    );

    expect(fetched).toBe(true);
    expect(posts[0]).toContain("Could not read transcript file");
  });

  test("derives the call title from the filename", async () => {
    const inputs: CallDigestInput[] = [];
    const posts: string[] = [];
    const sessions = createCallDigestSessions(config, () => {}, {
      fetchFile: async () => fileResponse(Buffer.from("y".repeat(60))),
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
          id: "F3",
          name: "acme-investor-call.txt",
          mimeType: "text/plain",
          size: 100,
          url: slackFileUrl,
        } satisfies TagAttachment,
      ],
      thread,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(inputs[0]?.callTitle).toBe("acme-investor-call");
  });

  test("rejects transcripts shorter than 50 characters", async () => {
    const posts: string[] = [];
    const sessions = createCallDigestSessions(config, () => {}, {
      fetchFile: async () => fileResponse(Buffer.from("   too short   ")),
    });
    const thread = makeThread("t5", posts);

    await sessions.requestTranscript("t5", thread, async () => {});
    await sessions.acceptTranscriptFile(
      "t5",
      [
        {
          id: "F4",
          name: "short.txt",
          mimeType: "text/plain",
          size: 10,
          url: slackFileUrl,
        } satisfies TagAttachment,
      ],
      thread,
    );

    expect(posts[0]).toContain("Could not read transcript file");
  });
});
