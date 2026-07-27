// modules/multi-core-host — all THREE @corbits cores mounted on ONE bare
// Interchange host, sharing one database, one connection pool, and one
// identity decision.
//
// This is the configuration a real adopter reaches for. The checks below are
// deliberately about coexistence rather than per-core behaviour (the other
// three module examples cover that):
//
//   - do three independent migration runners coexist in one database?
//   - does ONE identity decision satisfy all three seams?
//   - do the three route surfaces collide?
//   - does a cross-core flow work — upload an artifact, then deliver a mailbox
//     message that references it, while analytics counts the agent that did it?
//
// The mount itself is in ./app.ts. This file is the proof.
//
// Run:  bun run start     (asserts) | bun run serve   (listens)
// Needs a Postgres; see README.md.
import { sql } from "drizzle-orm";
import type { AssistantTurn, InferenceEvent } from "@intx/types/runtime";
import { deliverInboxItems, runMailboxMigrations } from "@corbits/mailbox-core";
import {
  createAnalyticsIngest,
  getAnalyticsSummary,
  runAnalyticsMigrations,
} from "@corbits/analytics-core";
import { runArtifactMigrations } from "@corbits/artifact-core";
import { check, finish, section } from "@corbits/example-kit/check";

import { buildApp } from "./app";

const turn = (model: string): AssistantTurn => ({
  role: "assistant",
  content: [{ type: "text", text: "filed the report" }],
  model,
  timestamp: 0,
});

const inferenceDone = (seq: number, model: string): InferenceEvent => ({
  type: "inference.done",
  seq,
  data: {
    turn: turn(model),
    usage: { input: 400, output: 120, cacheRead: 0, cacheWrite: 0, thinking: 0 },
    source: { sourceId: "source-1", provider: "openai-compatible", model },
  },
});

async function main() {
  const { app, db, signIn } = await buildApp();

  section("three migration runners over one database");
  const ledgers = await db.execute<{ tablename: string }>(sql`
    SELECT "tablename" FROM pg_tables
    WHERE "schemaname" = 'public' AND "tablename" LIKE '%_migrations'
    ORDER BY "tablename"
  `);
  check(
    ledgers.length === 3,
    `each core keeps its OWN ledger: ${ledgers.map((l) => l.tablename).join(", ")}`,
  );

  const tables = await db.execute<{ tablename: string }>(sql`
    SELECT "tablename" FROM pg_tables WHERE "schemaname" = 'public' ORDER BY "tablename"
  `);
  const names = tables.map((t) => t.tablename);
  check(
    new Set(names).size === names.length,
    "no two cores claimed the same physical table name",
  );
  // Worth knowing before you mount these next to your own schema: only the
  // migration ledgers are namespaced. The DATA tables are plain, unprefixed
  // nouns — `artifact`, `upload`, `analytics_event`, `mailbox` — so
  // the thing that keeps three cores from colliding is that they happen to
  // have picked disjoint names, not a prefix convention protecting you. If
  // your host already owns an `artifact` or an `upload`, that is a real
  // conflict and you want to find out here rather than in production.
  const dataTables = [
    "artifact",
    "artifact_version",
    "upload",
    "mail_attachment_ref",
    "analytics_event",
    "analytics_rollup_daily",
    "workflow_run_fact",
    "workflow_step_fact",
    "principal_mail",
    "mailbox",
  ];
  const missing = dataTables.filter((t) => !names.includes(t));
  check(
    missing.length === 0,
    `all three cores' data tables are present and unprefixed${missing.length > 0 ? ` (missing: ${missing.join(", ")})` : ""}`,
  );
  check(
    names.filter((n) => n.endsWith("_core_migrations")).length === 3,
    "only the migration ledgers are namespaced — one `*_core_migrations` per core",
  );

  await db.execute(sql`TRUNCATE TABLE "principal_mail" CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE "artifact", "artifact_version",
        "upload", "mail_attachment_ref" CASCADE`,
  );
  await db.execute(
    sql`TRUNCATE TABLE "analytics_event", "analytics_rollup_daily" CASCADE`,
  );

  check(
    (await app.request("/status")).status === 200,
    "the host's own routes still answer after three mounts",
  );

  section("the three route surfaces do not collide");
  const inbox = await app.request("/api/me/inbox");
  const artifacts = await app.request("/api/artifacts");
  const analytics = await app.request("/api/analytics/summary");
  check(
    inbox.status === 200 && artifacts.status === 200 && analytics.status === 200,
    "/api/me/inbox, /api/artifacts and /api/analytics/summary each answer 200",
  );
  const inboxBody = (await inbox.json()) as { messages?: unknown[] };
  const artifactsBody = (await artifacts.json()) as { artifacts?: unknown[] };
  check(
    Array.isArray(inboxBody.messages) && Array.isArray(artifactsBody.artifacts),
    "and each returns its OWN payload shape, so no route shadowed another",
  );

  section("a cross-core flow, all under one identity");
  // 1. An agent does some work. Analytics counts it.
  const ingest = createAnalyticsIngest({
    db: db,
    resolveInstance: async (subject) =>
      subject.kind === "address" && subject.address === "myra@acme.example"
        ? {
            tenantId: "acme",
            principalId: "instance-myra",
            agentId: "agent-myra",
            instanceId: "instance-myra",
            sessionId: "session-1",
          }
        : null,
  });
  await ingest.ingest({
    subject: { kind: "address", address: "myra@acme.example" },
    event: inferenceDone(1, "model-large"),
  });

  // 2. It produces a file, which becomes an artifact.
  const form = new FormData();
  form.append(
    "files",
    new File([new Uint8Array(Buffer.from("%PDF-1.7 Q3 numbers"))], "q3.pdf", {
      type: "application/pdf",
    }),
  );
  const uploadRes = await app.request("/api/artifacts/upload", {
    method: "POST",
    body: form,
  });
  const uploaded = (await uploadRes.json()) as { artifacts: { id: string }[] };
  check(uploadRes.status === 201, "the agent's output is stored as an artifact");
  const artifactId = uploaded.artifacts[0]!.id;

  // 3. The human is told about it, with the artifact carried as a mailbox ref.
  const delivered = await deliverInboxItems(db, [
    {
      tenantId: "acme",
      principalId: "avery",
      address: "avery@acme.example",
      fromAddress: "myra@acme.example",
      subject: "Q3 numbers are ready",
      body: "Attached.",
      source: "agent-myra",
      externalId: "q3-report",
      refs: [{ kind: "artifact", id: artifactId }],
    },
  ]);
  check(delivered[0]?.id !== null, "and a mailbox message announces it");

  // 4. All three surfaces agree about the same principal, in one request each.
  const listed = (await (await app.request("/api/me/inbox")).json()) as {
    messages: {
      id: string;
      subject?: string;
      refs?: { kind: string; id: string }[];
    }[];
  };
  check(
    listed.messages.length === 1 &&
      listed.messages[0]?.refs?.[0]?.id === artifactId,
    "the mailbox message carries the artifact id as a ref across the core boundary",
  );
  const detail = await app.request(`/api/artifacts/${artifactId}`);
  check(
    detail.status === 200,
    "and the referenced artifact resolves for the same signed-in user",
  );
  const summary = await getAnalyticsSummary({ db: db, tenantId: "acme" });
  check(
    summary.inputTokens === 400,
    "analytics counted the work that produced it, in the same database",
  );

  section("the shared resolver's failure mode is shared too");
  signIn(null);
  const anonInbox = await app.request("/api/me/inbox");
  const anonArtifacts = await app.request("/api/artifacts");
  const anonAnalytics = await app.request("/api/analytics/summary");
  // Mounting under `/api` means each core inherits whatever the HOST already
  // declared for the prefix it lands on. Interchange declares
  // `app.use("/api/me/*", requireAuth)`, so the mailbox is gated by the host
  // and a signed-out caller gets a 401 that never reaches the core. Artifacts
  // and analytics land on prefixes the host has not gated, so their own
  // no-principal behaviour is what answers.
  check(
    anonInbox.status === 401,
    "the mailbox sits under /api/me/*, so the host's own auth gate refuses first (401)",
  );
  // The payoff of mounting siblings: the cores implement the SAME no-member
  // asymmetry, so a host writes one policy rather than three. An aggregate
  // read is an empty 200 — an unknown principal truthfully has no data —
  // while anything naming a specific identity is a 403.
  check(
    anonArtifacts.status === 200 && anonAnalytics.status === 200,
    "artifacts and analytics, ungated by this host, answer an empty 200 for an aggregate read",
  );
  const anonDetail = await app.request(
    `/api/analytics/timeline/run/${artifactId}`,
  );
  const anonArtifactDetail = await app.request(`/api/artifacts/${artifactId}`);
  check(
    anonDetail.status === 403 && anonArtifactDetail.status === 403,
    "and both refuse (403) a detail read that names an identity — one policy, two cores",
  );

  section("re-running every migration is still safe");
  signIn({ tenantId: "acme", principalId: "avery" });
  await runMailboxMigrations(db);
  await runArtifactMigrations(db);
  await runAnalyticsMigrations(db);
  const stillThere = (await (await app.request("/api/me/inbox")).json()) as {
    messages: unknown[];
  };
  check(
    stillThere.messages.length === 1 &&
      (await app.request(`/api/artifacts/${artifactId}`)).status === 200,
    "a second boot of all three runners destroys nothing",
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
