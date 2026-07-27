// modules/mailbox-inbox — drive a mounted @corbits/mailbox-core the way a
// product would: something delivers mail, the signed-in user lists it, opens
// one, and marks it read. Then the two properties you actually depend on in
// production — a retried delivery does not duplicate, and one principal never
// sees another's mail.
//
// The mount itself is in ./app.ts. This file is the proof.
//
// Run:  bun run start     (asserts) | bun run serve   (listens)
// Needs a Postgres; see README.md.
import { sql } from "drizzle-orm";
import { deliverInboxItems, type InboxItem } from "@corbits/mailbox-core";
import { check, finish, section } from "@corbits/example-kit/check";

import { buildApp } from "./app";

type InboxList = { messages: { id: string; subject?: string; read: boolean }[] };

async function main() {
  const { app, db, signIn } = await buildApp();

  // The checks below count rows, so start from a known-empty mailbox.
  await db.execute(sql`TRUNCATE TABLE "principal_mail" CASCADE`);

  check(
    (await app.request("/status")).status === 200,
    "the host is a live @intx/hub-api app (GET /status)",
  );

  section("an ingress adapter delivers mail");
  // `deliverInboxItems` is the seam an ingress adapter writes through: a mail
  // connector, a webhook, anything durable-fanning-out into principal
  // mailboxes. It dedupes on `inbox:<source>:<externalId>`.
  const items: InboxItem[] = [
    {
      tenantId: "acme",
      principalId: "avery",
      address: "avery@acme.example",
      fromAddress: "billing@vendor.example",
      subject: "Invoice 4021 is ready",
      body: "Your February invoice is attached.",
      source: "vendor-webhook",
      externalId: "inv-4021",
    },
    {
      tenantId: "acme",
      principalId: "avery",
      address: "avery@acme.example",
      fromAddress: "ops@acme.example",
      subject: "Nightly job finished",
      body: "All 12 steps completed.",
      source: "vendor-webhook",
      externalId: "job-88",
    },
    {
      tenantId: "acme",
      principalId: "briar",
      address: "briar@acme.example",
      fromAddress: "legal@acme.example",
      subject: "Contract for review",
      body: "Please read before Friday.",
      source: "vendor-webhook",
      externalId: "contract-7",
    },
  ];
  const delivered = await deliverInboxItems(db, items);
  check(
    delivered.length === 3 && delivered.every((d) => d.id !== null),
    "three items are delivered, each writing a row",
  );

  section("the signed-in user lists, opens, and reads");
  const listed = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  check(
    listed.messages.length === 2,
    "Avery's inbox holds exactly her own two messages",
  );
  check(
    listed.messages[0]?.subject === "Nightly job finished",
    "the list is newest first",
  );

  const unreadBefore = (await (
    await app.request("/api/me/inbox/unread-count")
  ).json()) as { unread: number };
  check(unreadBefore.unread === 2, "both are unread to begin with");

  const target = listed.messages[1]!;
  const detail = (await (
    await app.request(`/api/me/inbox/${target.id}`)
  ).json()) as { subject?: string; body: string };
  check(
    detail.subject === "Invoice 4021 is ready" &&
      detail.body.includes("February invoice"),
    "opening a message returns its full body, re-derived from the stored frame",
  );

  const marked = await app.request(`/api/me/inbox/${target.id}/read`, {
    method: "POST",
  });
  check(marked.status === 200, "marking it read succeeds");
  const unreadAfter = (await (
    await app.request("/api/me/inbox/unread-count")
  ).json()) as { unread: number };
  check(unreadAfter.unread === 1, "the unread count drops to one");
  const relisted = (await (
    await app.request("/api/me/inbox?view=unread")
  ).json()) as InboxList;
  check(
    relisted.messages.length === 1 && relisted.messages[0]?.id !== target.id,
    "the unread view no longer contains it",
  );

  section("a retried delivery does not duplicate");
  const retry = await deliverInboxItems(db, items);
  check(
    retry.every((d) => d.id === null),
    "re-delivering the same three items writes nothing (id === null means deduped)",
  );
  const afterRetry = (await (
    await app.request("/api/me/inbox")
  ).json()) as InboxList;
  check(
    afterRetry.messages.length === 2,
    "the inbox still holds two messages after the retry",
  );
  const stillRead = afterRetry.messages.find((m) => m.id === target.id);
  check(
    stillRead?.read === true,
    "and the retry did not resurrect the message as unread",
  );

  section("one principal never sees another's mail");
  signIn({ tenantId: "acme", principalId: "briar" });
  const briar = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  check(
    briar.messages.length === 1 &&
      briar.messages[0]?.subject === "Contract for review",
    "Briar sees only her own message",
  );
  check(
    (await app.request(`/api/me/inbox/${target.id}`)).status === 404,
    "Avery's message is not found for Briar, even by id",
  );
  check(
    (await app.request(`/api/me/inbox/${target.id}/trash`, { method: "POST" }))
      .status === 404,
    "and she cannot mutate it",
  );

  // Same principal name, different tenant — the mailbox is keyed by the pair.
  signIn({ tenantId: "other-co", principalId: "avery" });
  const otherTenant = (await (
    await app.request("/api/me/inbox")
  ).json()) as InboxList;
  check(
    otherTenant.messages.length === 0,
    "the same principal name in another tenant gets an empty inbox",
  );

  section("no session at all");
  // Mounting under `/api` puts the mailbox behind Interchange's own
  // `app.use("/api/me/*", requireAuth)`. A signed-out request is refused by the
  // HOST before it ever reaches the core, so the answer is the hub's 401.
  signIn(null);
  check(
    (await app.request("/api/me/inbox")).status === 401,
    "listing without a session is refused by the host's own /api/me/* gate",
  );
  check(
    (await app.request(`/api/me/inbox/${target.id}`)).status === 401,
    "and so is reading a specific message",
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
