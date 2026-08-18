import { expect, test } from "bun:test";

import { createPublisher } from "./x-client";

const credentials = {
  X_LIVE: "1",
  X_API_KEY: "api-key",
  X_API_SECRET: "api-secret",
  X_ACCESS_TOKEN: "access-token",
  X_ACCESS_TOKEN_SECRET: "access-token-secret",
};

test("publisher defaults to dry-run without X_LIVE=1", async () => {
  const publisher = createPublisher({}, {
    newId: () => "receipt-1",
    now: () => new Date("2026-08-06T00:00:00.000Z"),
  });

  await expect(
    publisher.publish("A dry run", new AbortController().signal),
  ).resolves.toEqual({
    mode: "dry-run",
    postId: "dryrun-receipt-1",
    text: "A dry run",
    postedAt: "2026-08-06T00:00:00.000Z",
  });
});

test("live mode requires every OAuth credential", () => {
  expect(() => createPublisher({ X_LIVE: "1" })).toThrow(
    "requires all four X OAuth credentials",
  );
});

test("an unknown live-write outcome is surfaced and never retried", async () => {
  let requests = 0;
  const publisher = createPublisher(credentials, {
    fetcher: async () => {
      requests += 1;
      throw new Error("connection reset");
    },
  });

  await expect(
    publisher.publish("Do not retry", new AbortController().signal),
  ).rejects.toThrow("outcome unknown, so it was not retried");
  expect(requests).toBe(1);
});

test("a live response without an X post id remains an unknown outcome", async () => {
  const publisher = createPublisher(credentials, {
    fetcher: async () => new Response("{}", { status: 201 }),
  });

  await expect(
    publisher.publish("Inspect X", new AbortController().signal),
  ).rejects.toThrow("inspect X before retrying");
});
