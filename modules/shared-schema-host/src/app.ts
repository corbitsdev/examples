import { sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  createInMemoryMailboxEventBus,
  mountMailbox,
  runMailboxMigrations,
} from "@corbits/mailbox-core";
import {
  InlineContentStore,
  mountArtifacts,
  runArtifactMigrations,
} from "@corbits/artifact-core";
import {
  bareInterchangeApp,
  createDB,
  pgConfigInSchema,
  resolvePrincipal,
  resolveTenantPrincipal,
  staticSessions,
  type AppEnv,
  type Session,
} from "@corbits/example-kit/host";

export const DATABASE_URL =
  process.env.EXAMPLES_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5459/ex_shared_schema";

/**
 * The schema the cores live in. It is the HOST's choice and the cores never
 * hear about it: they emit unqualified table names, and the connection's
 * `search_path` decides where those land.
 */
export const CORE_SCHEMA = "corbits";

const VOCABULARY = {
  priorities: ["urgent", "high", "normal", "low"],
  statuses: ["open", "waiting", "done"],
} as const;

export async function buildApp(): Promise<{
  app: Hono<AppEnv>;
  db: ReturnType<typeof createDB>["db"];
  publicDb: ReturnType<typeof createDB>["db"];
  signIn: (session: Session) => void;
}> {
  const hub = createDB(pgConfigInSchema(DATABASE_URL, CORE_SCHEMA));
  const db = hub.db;

  // The host owns the schema's existence; `search_path` only says where to
  // look, it does not create anything.
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${CORE_SCHEMA}"`));

  await runMailboxMigrations(db);
  await runArtifactMigrations(db);

  let signedIn: Session = { tenantId: "acme", principalId: "avery" };
  const app = bareInterchangeApp(hub, staticSessions(() => signedIn));

  const api = new Hono<AppEnv>();
  mountMailbox(api, {
    db,
    bus: createInMemoryMailboxEventBus(),
    resolvePrincipal,
    vocabulary: VOCABULARY,
  });
  mountArtifacts(api, {
    db,
    contentStore: InlineContentStore,
    resolvePrincipal: resolveTenantPrincipal,
  });
  app.route("/api", api);

  // A second, unpinned connection to the SAME database — the checks use it to
  // show that the host's default `search_path` sees none of the core tables.
  const plain = createDB(pgConfigInSchema(DATABASE_URL, "public"));

  return {
    app,
    db,
    publicDb: plain.db,
    signIn: (session) => {
      signedIn = session;
    },
  };
}
