// modules/shared-schema-host — two cores on ONE host, sharing one database
// but living in a schema of the host's choosing rather than in `public`.
//
// This is the question every adopter with an existing database asks: "will
// these packages create tables next to mine?" They will, unless you tell the
// connection otherwise. The cores emit unqualified table names; `@intx/db`
// pins `search_path` on the connection; the tables land wherever that points.
// Nothing in either core knows the schema's name.
//
// The mount itself is in ./app.ts. This file is the proof.
//
// Run:  bun run start     (asserts) | bun run serve   (listens)
// Needs a Postgres; see README.md.
import { sql } from "drizzle-orm";
import { deliverInboxItems } from "@corbits/mailbox-core";
import { check, finish, section } from "@corbits/example-kit/check";

import { buildApp, CORE_SCHEMA } from "./app";

type InboxList = { messages: { id: string; subject?: string }[] };
type Listing = { artifacts: { id: string; title: string }[] };

const CORE_TABLES = ["principal_mail", "mailbox", "artifact", "artifact_version"];

async function tableNames(
  db: Awaited<ReturnType<typeof buildApp>>["db"],
  schema: string,
): Promise<string[]> {
  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT "tablename" FROM pg_tables WHERE "schemaname" = ${schema}
  `);
  return rows.map((r) => r.tablename);
}

async function main() {
  const { app, db, publicDb } = await buildApp();

  await db.execute(sql`TRUNCATE TABLE "principal_mail" CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE "artifact", "artifact_version", "upload" CASCADE`,
  );

  section("both cores migrated into the host's schema, not into public");
  const inSchema = await tableNames(db, CORE_SCHEMA);
  const missing = CORE_TABLES.filter((t) => !inSchema.includes(t));
  check(
    missing.length === 0,
    `every core table lives in "${CORE_SCHEMA}"${missing.length > 0 ? ` (missing: ${missing.join(", ")})` : ""}`,
  );

  const inPublic = await tableNames(db, "public");
  const leaked = CORE_TABLES.filter((t) => inPublic.includes(t));
  check(
    leaked.length === 0,
    `and none of them leaked into "public"${leaked.length > 0 ? ` (found: ${leaked.join(", ")})` : ""}`,
  );

  const ledgers = inSchema.filter((t) => t.endsWith("_core_migrations"));
  check(
    ledgers.length === 2,
    `each core's migration ledger followed it into the schema: ${ledgers.sort().join(", ")}`,
  );

  section("a connection on the default search_path cannot see them");
  // The same database, a connection the host did not pin. `principal_mail` is
  // unqualified here too, so it resolves against `public` and is simply not
  // there — which is the isolation the schema buys.
  let refused = false;
  try {
    await publicDb.execute(sql`SELECT 1 FROM "principal_mail" LIMIT 1`);
  } catch {
    refused = true;
  }
  check(
    refused,
    "an unpinned connection resolves `principal_mail` against public and finds nothing",
  );

  section("both cores work normally through the shared schema");
  const delivered = await deliverInboxItems(db, [
    {
      tenantId: "acme",
      principalId: "avery",
      address: "avery@acme.example",
      fromAddress: "ops@acme.example",
      subject: "Backup completed",
      body: "Nothing to do.",
      source: "shared-schema-demo",
      externalId: "backup-1",
    },
  ]);
  check(delivered[0]?.id !== null, "mail is delivered into the pinned schema");

  const listed = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  check(
    listed.messages.length === 1 &&
      listed.messages[0]?.subject === "Backup completed",
    "and GET /api/me/inbox reads it back over HTTP",
  );

  const form = new FormData();
  form.append(
    "files",
    new File([new Uint8Array(Buffer.from("%PDF-1.7 backup log"))], "log.pdf", {
      type: "application/pdf",
    }),
  );
  const uploadRes = await app.request("/api/artifacts/upload", {
    method: "POST",
    body: form,
  });
  check(
    uploadRes.status === 201,
    "an artifact uploads into the same schema, through the same pool",
  );
  const artifacts = (await (
    await app.request("/api/artifacts?limit=10")
  ).json()) as Listing;
  check(
    artifacts.artifacts.length === 1,
    "and GET /api/artifacts lists it — one search_path, two cores",
  );

  section("re-running both migration runners in the schema is safe");
  const before = await tableNames(db, CORE_SCHEMA);
  const { db: second } = await buildApp();
  const after = await tableNames(second, CORE_SCHEMA);
  check(
    after.length === before.length,
    "a second boot against the same schema adds no tables",
  );
  const survived = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  check(survived.messages.length === 1, "and destroys nothing already in it");

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
