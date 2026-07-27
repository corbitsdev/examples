// modules/analytics-rollups — feed a mounted @corbits/analytics-core a stream
// of NATIVE `@intx` inference events and check the two properties the package
// sells: the daily rollup agrees with the raw facts, and a rebuild from
// scratch lands byte-identical to the incrementally-maintained rollup it
// replaces.
//
// Every event below is a real member of the published `@intx/types`
// `InferenceEvent` union — no casts, nothing invented.
//
// The mount itself is in ./app.ts. This file is the proof.
//
// Run:  bun run start     (asserts) | bun run serve   (listens)
// Needs a Postgres; see README.md.
import { sql } from "drizzle-orm";
import type { AssistantTurn, InferenceEvent } from "@intx/types/runtime";
import {
  createAnalyticsIngest,
  getAnalyticsSummary,
  getToolBreakdown,
  rebuildDailyRollups,
  type AnalyticsDb,
  type AnalyticsInstance,
} from "@corbits/analytics-core";
import { check, finish, section } from "@corbits/example-kit/check";

import { buildApp } from "./app";

// ─── the emitting agents ───────────────────────────────────────────────
// The ingest seam maps an emitting agent's ADDRESS to the instance its facts
// are attributed to. That mapping is the host's — this app keeps a table.
const INSTANCES: Record<string, AnalyticsInstance> = {
  "myra@acme.example": {
    tenantId: "acme",
    principalId: "instance-myra",
    agentId: "agent-myra",
    instanceId: "instance-myra",
    sessionId: "session-1",
  },
  "scout@acme.example": {
    tenantId: "acme",
    principalId: "instance-scout",
    agentId: "agent-scout",
    instanceId: "instance-scout",
    sessionId: "session-2",
  },
};


// ─── native event builders ─────────────────────────────────────────────
const turn = (model: string): AssistantTurn => ({
  role: "assistant",
  content: [{ type: "text", text: "done" }],
  model,
  timestamp: 0,
});

const inferenceDone = (
  seq: number,
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; thinking: number },
): InferenceEvent => ({
  type: "inference.done",
  seq,
  data: {
    turn: turn(model),
    usage,
    source: { sourceId: "source-1", provider: "openai-compatible", model },
  },
});

const runEnded = (seq: number, status: "completed" | "failed"): InferenceEvent => ({
  type: "message.run.ended",
  seq,
  data: { messageRunId: `run-${seq}`, messageId: `msg-${seq}`, status },
});

const toolStart = (seq: number, callId: string, name: string): InferenceEvent => ({
  type: "tool.start",
  seq,
  data: { call: { id: callId, name, arguments: {} } },
});

const toolDone = (seq: number, callId: string, isError = false): InferenceEvent => ({
  type: "tool.done",
  seq,
  data: { result: { callId, content: "ok", isError } },
});

const USAGE = { input: 100, output: 50, cacheRead: 20, cacheWrite: 10, thinking: 5 };

type RollupRow = {
  rollup_key: string;
  turn_count: string;
  input_tokens: string;
  output_tokens: string;
  tool_call_count: string;
};

const readRollups = (db: AnalyticsDb) =>
  db.execute<RollupRow>(sql`
    SELECT "rollup_key", "turn_count", "input_tokens", "output_tokens", "tool_call_count"
    FROM "analytics_rollup_daily" ORDER BY "rollup_key"
  `);

const fingerprint = (rows: RollupRow[]) =>
  rows
    .map(
      (r) =>
        `${r.rollup_key}|${r.turn_count}|${r.input_tokens}|${r.output_tokens}|${r.tool_call_count}`,
    )
    .join("\n");

async function main() {
  const { app, db, signIn } = await buildApp();

  await db.execute(
    sql`TRUNCATE TABLE "analytics_event", "analytics_rollup_daily",
        "workflow_run_fact", "workflow_step_fact" CASCADE`,
  );

  // ─── ingest ──────────────────────────────────────────────────────────
  const ingest = createAnalyticsIngest({
    db,
    resolveInstance: async (subject) =>
      subject.kind === "address" ? (INSTANCES[subject.address] ?? null) : null,
  });

  section("ingest a stream of native inference events");
  const stream: [string, InferenceEvent][] = [
    ["myra@acme.example", inferenceDone(1, "model-large", USAGE)],
    ["myra@acme.example", runEnded(2, "completed")],
    ["myra@acme.example", toolStart(3, "call-a", "read_file")],
    ["myra@acme.example", toolDone(4, "call-a")],
    ["myra@acme.example", toolStart(5, "call-b", "write_file")],
    ["myra@acme.example", toolDone(6, "call-b", true)],
    ["myra@acme.example", inferenceDone(7, "model-large", USAGE)],
    ["scout@acme.example", inferenceDone(1, "model-small", USAGE)],
    ["scout@acme.example", runEnded(2, "failed")],
    ["scout@acme.example", toolStart(3, "call-c", "read_file")],
    ["scout@acme.example", toolDone(4, "call-c")],
  ];
  for (const [address, event] of stream) {
    await ingest.ingest({ subject: { kind: "address", address }, event });
  }

  const facts = await db.execute<{ n: string }>(
    sql`SELECT count(*)::text AS n FROM "analytics_event"`,
  );
  // tool.start writes no fact — a call that never completes is not countable —
  // so 11 events produce 8 facts.
  check(facts[0]?.n === "8", "eleven events produce eight durable facts");

  section("the rollup agrees with the raw facts");
  const summary = await getAnalyticsSummary({ db, tenantId: "acme" });
  check(
    summary.inputTokens === 300 && summary.outputTokens === 150,
    "tokens are counted on inference.done only (3 calls x 100/50)",
  );
  check(
    summary.cacheReadTokens === 60 && summary.cacheWriteTokens === 30,
    "the cache split survives into the rollup",
  );
  // Careful: `turnCount` is the COMPLETED count, not the total. A failed run
  // lands in `failedTurnCount` and nowhere else, so the total is the sum of
  // the two — nothing in the package reports it for you.
  check(summary.turnCount === 1, "one message run completed");
  check(summary.failedTurnCount === 1, "and one failed");
  check(
    summary.turnCount + summary.failedTurnCount === 2,
    "two runs ended in total",
  );
  check(
    summary.toolCallCount === 3 && summary.toolErrorCount === 1,
    "three tool calls completed, one of them an error",
  );

  const tools = await getToolBreakdown({ db, tenantId: "acme" });
  const byName = new Map(tools.map((t) => [t.name, t]));
  check(
    byName.get("read_file")?.calls === 2 && byName.get("read_file")?.errors === 0,
    "the tool name captured on tool.start is carried onto its tool.done fact",
  );
  check(
    byName.get("write_file")?.calls === 1 && byName.get("write_file")?.errors === 1,
    "and the failing tool is separated out by name",
  );

  section("a redelivered event changes nothing");
  const beforeRedelivery = fingerprint(await readRollups(db));
  for (const [address, event] of stream) {
    await ingest.ingest({ subject: { kind: "address", address }, event });
  }
  const factsAfter = await db.execute<{ n: string }>(
    sql`SELECT count(*)::text AS n FROM "analytics_event"`,
  );
  check(factsAfter[0]?.n === "8", "replaying the whole stream writes no new facts");
  check(
    fingerprint(await readRollups(db)) === beforeRedelivery,
    "and skipping the fact also skips its rollup, so nothing double-counts",
  );

  section("rebuilding from scratch reproduces the incremental rollup");
  const incremental = fingerprint(await readRollups(db));
  // Corrupt the cache on purpose. The rollup is a cache over the facts, so a
  // full recompute must CORRECT this, not accumulate on top of it.
  await db.execute(
    sql`UPDATE "analytics_rollup_daily" SET "input_tokens" = "input_tokens" + 999`,
  );
  check(
    fingerprint(await readRollups(db)) !== incremental,
    "the rollup is measurably skewed",
  );
  const written = await rebuildDailyRollups({ db, tenantId: "acme" });
  check(written > 0, `the rebuild rewrote ${written} rollup rows`);
  check(
    fingerprint(await readRollups(db)) === incremental,
    "and lands byte-identical to the incrementally-maintained rollup",
  );

  section("the mounted read surface serves it");
  check(
    (await app.request("/status")).status === 200,
    "the host is a live @intx/hub-api app",
  );
  const httpSummary = await app.request("/api/analytics/summary");
  check(httpSummary.status === 200, "GET /api/analytics/summary answers");
  const body = (await httpSummary.json()) as { inputTokens?: number };
  check(
    body.inputTokens === 300,
    "over HTTP it reports the same totals the library does",
  );

  const byAgent = (await (
    await app.request("/api/analytics/summary/by-agent")
  ).json()) as { agents?: { agentName: string | null }[] } | { agentName: string | null }[];
  const agentRows = Array.isArray(byAgent) ? byAgent : (byAgent.agents ?? []);
  check(
    agentRows.some((a) => a.agentName === "Myra"),
    "the agent-name seam decorated the per-agent breakdown",
  );

  // The no-member asymmetry, shared verbatim by every Corbits core so a host
  // mounting several of them writes ONE policy: aggregate reads answer an
  // empty 200 (an unknown principal genuinely has no data, and "no data" is a
  // truthful aggregate), while single-item detail reads and mutations answer
  // 403 (they name a specific identity, and there is none to name — a 404
  // would leak whether the id exists).
  signIn(null);
  const anon = await app.request("/api/analytics/summary");
  const anonBody = (await anon.json()) as {
    tenantId: string | null;
    turnCount: number;
  };
  check(
    anon.status === 200 &&
      anonBody.tenantId === null &&
      anonBody.turnCount === 0,
    "with no session the aggregate answers an empty 200 in the same shape, not a 403",
  );
  check(
    (await app.request("/api/analytics/timeline/run/some-run-id")).status === 403,
    "but a single-item detail read, which names an identity, is refused (403)",
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
