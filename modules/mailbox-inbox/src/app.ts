import { Hono } from "hono";
import {
  createInMemoryMailboxEventBus,
  mountMailbox,
  runMailboxMigrations,
  type MailboxDb,
} from "@corbits/mailbox-core";
import {
  bareInterchangeApp,
  createDB,
  pgConfig,
  resolvePrincipal,
  staticSessions,
  type AppEnv,
  type Session,
} from "@corbits/example-kit/host";

export const DATABASE_URL =
  process.env.EXAMPLES_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5459/ex_mailbox";

/**
 * The triage vocabulary is the HOST's — the package ships no default, because
 * a default would make one product's taxonomy every adopter's. `priorities` is
 * ordered most-urgent-first, and that order is the ranking `?sort=priority`
 * uses.
 */
const VOCABULARY = {
  priorities: ["urgent", "high", "normal", "low"],
  statuses: ["open", "waiting", "done"],
} as const;

export async function buildApp(): Promise<{
  app: Hono<AppEnv>;
  db: MailboxDb;
  signIn: (session: Session) => void;
}> {
  // ONE pool. The mailbox mounts on the handle the host already has — the seam
  // takes any drizzle postgres-js instance, so nothing opens a second
  // connection to the same database.
  const hub = createDB(pgConfig(DATABASE_URL));
  const db: MailboxDb = hub.db;

  // Boot-time, once, before anything is served. Idempotent and advisory-locked,
  // so every replica may call it on every cold start.
  await runMailboxMigrations(db);

  let signedIn: Session = { tenantId: "acme", principalId: "avery" };
  const app = bareInterchangeApp(hub, staticSessions(() => signedIn));

  // Mounted @corbits/* modules serve under `/api`, the prefix Interchange
  // serves its own routes under (`app.route("/api/me", …)`). The core
  // registers its routes root-relative, so nest them in a sub-app and route
  // that at `/api`. No `/v1` segment, no vendor prefix.
  const api = new Hono<AppEnv>();
  mountMailbox(api, {
    db,
    bus: createInMemoryMailboxEventBus(),
    resolvePrincipal,
    vocabulary: VOCABULARY,
  });
  app.route("/api", api);

  return {
    app,
    db,
    signIn: (session) => {
      signedIn = session;
    },
  };
}
