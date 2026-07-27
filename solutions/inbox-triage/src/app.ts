import { Hono } from "hono";
import {
  createInMemoryMailboxEventBus,
  mountMailbox,
  runMailboxMigrations,
  type MailboxDb,
  type MailboxVocabulary,
} from "@corbits/mailbox-core";
import {
  bareInterchangeApp,
  createDB,
  pgConfig,
  resolvePrincipal,
  staticSessions,
  type AppEnv,
} from "@corbits/example-kit/host";

export const DATABASE_URL =
  process.env.EXAMPLES_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5459/ex_mailbox";

export const TENANT_ID = "acme";
export const PRINCIPAL_ID = "avery";
export const ADDRESS = "avery@acme.example";

/**
 * The triage vocabulary this product uses. It is the host's, not the core's,
 * and it is declared once here so the mount, the `?priority=` enum and the
 * agent's prompt cannot drift apart.
 */
export const VOCABULARY: MailboxVocabulary = {
  priorities: ["urgent", "high", "normal", "low"],
  statuses: ["needs-action", "waiting", "done"],
};

export async function buildApp(): Promise<{
  app: Hono<AppEnv>;
  db: MailboxDb;
}> {
  const hub = createDB(pgConfig(DATABASE_URL));
  const db: MailboxDb = hub.db;

  await runMailboxMigrations(db);

  const app = bareInterchangeApp(
    hub,
    staticSessions(() => ({ tenantId: TENANT_ID, principalId: PRINCIPAL_ID })),
  );

  // Mounted @corbits/* modules serve under `/api`, the prefix Interchange
  // serves its own routes under. The core registers `/me/inbox*`
  // root-relative, so nest it in a sub-app and route that at `/api`.
  const api = new Hono<AppEnv>();
  mountMailbox(api, {
    db,
    bus: createInMemoryMailboxEventBus(),
    resolvePrincipal,
    vocabulary: VOCABULARY,
  });
  app.route("/api", api);

  return { app, db };
}
