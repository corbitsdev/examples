// solutions/inbox-triage — an agent reads a mounted @corbits/mailbox-core
// inbox and stamps triage back onto the rows.
//
// The modules/ examples prove a core mounts. This one proves a core is
// useful to an agent, which is a different claim: mail is delivered
// through the core's ingress seam, the agent reads it through the same
// HTTP surface a UI would use, decides priority/classification/status,
// and writes that judgement back onto the row so the next reader of the
// mailbox sees it.
//
// Every step goes through @corbits/mailbox-core's own mounted routes —
// GET /api/me/inbox, GET /api/me/inbox/:id, POST /api/me/inbox/:id/enrich, and
// then GET /api/me/inbox?priority=… to select on what the agent decided.
// Nothing here reaches past the package into its tables, which matters: the
// principal scoping, the vocabulary validation and the change event all live
// in the core, and an example that open-codes the UPDATE teaches an adopter to
// re-derive exactly the tenant isolation they should be inheriting.
//
// Inference is configured entirely from the environment — endpoint, model and
// credential. The mount is in ./app.ts.
//
// Run:  bun run start
// Needs a Postgres and a configured inference endpoint; see README.md.

import { sql } from "drizzle-orm";
import { deliverInboxItems, type InboxItem } from "@corbits/mailbox-core";
import { check, finish, section } from "@corbits/example-kit/check";
import { resolveSource } from "@corbits/example-kit/inference";

import {
  ADDRESS,
  buildApp,
  PRINCIPAL_ID,
  TENANT_ID,
  VOCABULARY,
} from "./app";
import { createTriageAgent, type Triage } from "./triage";

type ListedMessage = {
  id: string;
  subject?: string;
  read: boolean;
  priority?: string;
  classification?: string;
  status?: string;
};
type InboxList = { messages: ListedMessage[] };
type MessageDetail = ListedMessage & { from?: string; body: string };

/** Four messages a real operator would want sorted differently. */
const MAIL: InboxItem[] = [
  {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    address: ADDRESS,
    fromAddress: "security@vendor.example",
    subject: "ACTION REQUIRED: rotate your API credentials by Friday",
    body:
      "We detected that a credential issued to your account was exposed in a " +
      "public repository. Rotate it in the console before Friday or we will " +
      "revoke it automatically.",
    source: "triage-demo",
    externalId: "sec-1",
  },
  {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    address: ADDRESS,
    fromAddress: "billing@vendor.example",
    subject: "Invoice 4021 is ready",
    body:
      "Your February invoice for $412.00 is available. Payment is collected " +
      "automatically on the 1st; no action is needed.",
    source: "triage-demo",
    externalId: "inv-4021",
  },
  {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    address: ADDRESS,
    fromAddress: "ops@acme.example",
    subject: "Nightly job finished",
    body: "All 12 steps completed in 4m11s. No failures. This is an automated notice.",
    source: "triage-demo",
    externalId: "job-88",
  },
  {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    address: ADDRESS,
    fromAddress: "legal@acme.example",
    subject: "Contract for review before Friday",
    body:
      "Attached is the renewal agreement. Please read the liability section " +
      "and send me your comments before Friday so we can counter-sign.",
    source: "triage-demo",
    externalId: "contract-7",
  },
];

/** Render the triage columns of a listed message for the before/after table. */
function row(message: ListedMessage): string {
  const cell = (value: string | undefined) => (value ?? "—").padEnd(16);
  return (
    `  ${cell(message.priority)}${cell(message.classification)}` +
    `${cell(message.status)}${message.subject ?? "(no subject)"}`
  );
}

function printTable(title: string, messages: ListedMessage[]): void {
  console.log(`\n  ${title}`);
  console.log(
    `  ${"priority".padEnd(16)}${"classification".padEnd(16)}${"status".padEnd(16)}subject`,
  );
  console.log(`  ${"-".repeat(76)}`);
  for (const message of messages) console.log(row(message));
}

async function main() {
  const source = resolveSource(process.env);
  if (source.error !== undefined) {
    console.error(source.error);
    process.exit(1);
  }

  const { app, db } = await buildApp();

  // The before/after table is only meaningful from a known-empty start.
  await db.execute(sql`TRUNCATE TABLE "principal_mail" CASCADE`);

  section("mail lands, untriaged");
  const delivered = await deliverInboxItems(db, MAIL);
  check(
    delivered.length === 4 && delivered.every((d) => d.id !== null),
    "four messages are delivered through the core's ingress seam",
  );

  // The BEFORE state, read back through the mailbox's own HTTP surface
  // — not from a variable this script is holding.
  const before = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  printTable("BEFORE", before.messages);
  check(
    before.messages.every(
      (m) =>
        m.priority === undefined &&
        m.classification === undefined &&
        m.status === undefined,
    ),
    "every row arrives with priority, classification and status unset",
  );

  section(`the agent triages the inbox (${source.source.provider}/${source.source.model})`);
  const agent = await createTriageAgent({
    source: source.source,
    workdir: `${process.cwd()}/tmp/inbox-triage/context`,
    vocabulary: VOCABULARY,
  });

  const decisions = new Map<string, Triage>();
  try {
    for (const message of before.messages) {
      // The agent opens each message the way the UI does: GET the
      // detail route, which re-derives the body from the stored MIME
      // frame. It never reads the table.
      const detail = (await (
        await app.request(`/api/me/inbox/${message.id}`)
      ).json()) as MessageDetail;

      const triage = await agent.triage({
        from: detail.from ?? "unknown",
        subject: detail.subject ?? "",
        body: detail.body,
      });

      if (triage === null) {
        check(false, `the agent returned a valid triage for "${detail.subject ?? ""}"`);
        continue;
      }
      console.log(
        `  triaged  ${triage.priority}/${triage.classification}/${triage.status}` +
          `  ${detail.subject ?? ""}`,
      );
      decisions.set(message.id, triage);

      // The write goes back through the mailbox's own route, the same way
      // the read came out of it. The agent never touches the table: the
      // core owns the principal scoping, the enum validation and the
      // change event, and an adopter copying this file inherits all three.
      const stamped = await app.request(`/api/me/inbox/${message.id}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(triage),
      });
      check(
        stamped.status === 200,
        `POST /api/me/inbox/:id/enrich accepted the triage for "${detail.subject ?? ""}"`,
      );
    }
  } finally {
    await agent.close();
  }

  section("the enrichment is visible to every mailbox reader");
  const after = (await (await app.request("/api/me/inbox")).json()) as InboxList;
  printTable("AFTER", after.messages);

  check(
    after.messages.length === 4 &&
      after.messages.every(
        (m) =>
          m.priority !== undefined &&
          m.classification !== undefined &&
          m.status !== undefined,
      ),
    "every row now carries all three triage fields, read back through GET /api/me/inbox",
  );

  const sample = after.messages[0];
  if (sample === undefined) {
    check(false, "the inbox has a message to re-read through the detail route");
    finish();
  }
  const detail = (await (
    await app.request(`/api/me/inbox/${sample.id}`)
  ).json()) as MessageDetail;
  check(
    detail.priority === sample.priority &&
      detail.classification === sample.classification &&
      detail.status === sample.status,
    "the detail route projects the same triage as the list route",
  );

  check(
    after.messages.every((m) => decisions.get(m.id)?.priority === m.priority),
    "each row carries the priority the agent chose for that specific message",
  );

  // Enrichment is orthogonal to the read/archive/trash lifecycle: it must
  // not have marked anything read as a side effect.
  const unread = (await (
    await app.request("/api/me/inbox/unread-count")
  ).json()) as { unread: number };
  check(
    unread.unread === 4,
    "triage did not mark anything read — enrichment is orthogonal to the read lifecycle",
  );

  section("the enrichment is selectable, not just readable");

  // Triage that cannot be selected on is decoration. Probe with a priority
  // the agent actually assigned, so the assertion cannot pass vacuously on
  // an empty result.
  const probe = after.messages[0]?.priority;
  if (probe === undefined) {
    check(false, "the triaged inbox has a priority to filter by");
    finish();
  }
  const expected = after.messages
    .filter((m) => m.priority === probe)
    .map((m) => m.id)
    .sort();

  const filtered = (await (
    await app.request(`/api/me/inbox?priority=${probe}`)
  ).json()) as InboxList;
  printTable(`FILTERED  ?priority=${probe}`, filtered.messages);

  const got = filtered.messages.map((m) => m.id).sort();
  check(
    got.length === expected.length && got.every((id, i) => id === expected[i]),
    `?priority=${probe} selects exactly the ${String(expected.length)} of 4 rows ` +
      `the agent marked ${probe} — the parameter is honored, not ignored`,
  );

  // The other half of "it selects": a filter that matches nothing must come
  // back empty rather than falling through to the whole inbox. Without this,
  // an ignored parameter would still pass the assertion above whenever the
  // agent happened to give every row the same priority.
  const absent = VOCABULARY.priorities.find(
    (p) => !after.messages.some((m) => m.priority === p),
  );
  if (absent !== undefined) {
    const empty = (await (
      await app.request(`/api/me/inbox?priority=${absent}`)
    ).json()) as InboxList;
    check(
      empty.messages.length === 0,
      `?priority=${absent} matches no row and returns 0 messages, not all 4`,
    );
  }

  // A closed vocabulary: a typo'd priority is a 400, not a silently empty page.
  const typo = await app.request("/api/me/inbox?priority=urgnet");
  check(typo.status === 400, "an unknown priority is rejected with a 400");

  // Sorting by the enrichment, which is the reason to stamp it at all.
  const ranked = (await (
    await app.request("/api/me/inbox?sort=priority")
  ).json()) as InboxList;
  // The ranking IS the host vocabulary's order — most urgent first.
  const rankOf = (m: ListedMessage) => {
    const i = VOCABULARY.priorities.indexOf(m.priority ?? "");
    return i === -1 ? VOCABULARY.priorities.length : i;
  };
  check(
    ranked.messages.length === 4 &&
      ranked.messages.every((m, i) => i === 0 || rankOf(ranked.messages[i - 1]!) <= rankOf(m)),
    "?sort=priority returns all 4 rows most-urgent-first",
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
