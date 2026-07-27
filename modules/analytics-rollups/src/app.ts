import { Hono } from "hono";
import {
  mountAnalytics,
  runAnalyticsMigrations,
  type AnalyticsDb,
} from "@corbits/analytics-core";
import {
  bareInterchangeApp,
  createDB,
  pgConfig,
  resolveTenantPrincipal,
  staticSessions,
  type AppEnv,
  type Session,
} from "@corbits/example-kit/host";

export const DATABASE_URL =
  process.env.EXAMPLES_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5459/ex_analytics";

// Display names for the agents this app runs. The package owns facts, not a
// directory, so an id it does not know comes back null and the row survives.
const AGENT_NAMES: Record<string, string> = {
  "agent-myra": "Myra",
  "agent-scout": "Scout",
};

export async function buildApp(): Promise<{
  app: Hono<AppEnv>;
  db: AnalyticsDb;
  signIn: (session: Session) => void;
}> {
  const hub = createDB(pgConfig(DATABASE_URL));
  const db: AnalyticsDb = hub.db;

  await runAnalyticsMigrations(db);

  let signedIn: Session = { tenantId: "acme", principalId: "avery" };
  const app = bareInterchangeApp(hub, staticSessions(() => signedIn));

  // Mounted @corbits/* modules serve under `/api`, the prefix Interchange
  // serves its own routes under (`app.route("/api/me", …)`). The core
  // registers its routes root-relative, so nest them in a sub-app and route
  // that at `/api`. No `/v1` segment, no vendor prefix.
  const api = new Hono<AppEnv>();
  mountAnalytics(api, {
    db,
    resolvePrincipal: resolveTenantPrincipal,
    resolveAgentName: async ({ agentIds }) =>
      new Map(agentIds.map((id) => [id, AGENT_NAMES[id] ?? null])),
    // Widening the feed past the caller's own principal is an authorization
    // decision, so the host makes it explicitly: this app attributes an agent
    // instance's facts to whoever runs it.
    resolveAttribution: () => ["instance-myra", "instance-scout"],
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
