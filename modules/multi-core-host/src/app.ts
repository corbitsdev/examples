import { Hono } from "hono";
import {
  createInMemoryMailboxEventBus,
  mountMailbox,
  runMailboxMigrations,
  type MailboxDb,
} from "@corbits/mailbox-core";
import {
  InlineContentStore,
  mountArtifacts,
  runArtifactMigrations,
  type ArtifactDb,
} from "@corbits/artifact-core";
import {
  mountAnalytics,
  runAnalyticsMigrations,
  type AnalyticsDb,
} from "@corbits/analytics-core";
import {
  bareInterchangeApp,
  createDB,
  pgConfig,
  resolvePrincipal,
  resolveTenantPrincipal,
  staticSessions,
  type AppEnv,
  type Session,
} from "@corbits/example-kit/host";

export const DATABASE_URL =
  process.env.EXAMPLES_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5459/ex_multicore";

const VOCABULARY = {
  priorities: ["urgent", "high", "normal", "low"],
  statuses: ["open", "waiting", "done"],
} as const;

export async function buildApp(): Promise<{
  app: Hono<AppEnv>;
  db: MailboxDb & ArtifactDb & AnalyticsDb;
  signIn: (session: Session) => void;
}> {
  // ONE pool, shared by the host and all three cores.
  const hub = createDB(pgConfig(DATABASE_URL));
  const db = hub.db;

  // Order is not load-bearing: none of the three has a foreign key into
  // another, or into the host. Run them in whatever order boot reaches them.
  await runAnalyticsMigrations(db);
  await runMailboxMigrations(db);
  await runArtifactMigrations(db);

  let signedIn: Session = { tenantId: "acme", principalId: "avery" };
  const app = bareInterchangeApp(hub, staticSessions(() => signedIn));

  // All three mount into ONE sub-app routed at `/api` — the prefix Interchange
  // serves its own routes under (`app.route("/api/me", …)`). The host answers
  // "who is this request?" once; the two spellings below are the same answer,
  // because mailbox-core has moved to `{ tenantId, principalId }` and the other
  // two have not yet.
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
  mountAnalytics(api, {
    db,
    resolvePrincipal: resolveTenantPrincipal,
    resolveAgentName: async ({ agentIds }) =>
      new Map(agentIds.map((id) => [id, id === "agent-myra" ? "Myra" : null])),
    resolveAttribution: () => ["instance-myra"],
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
