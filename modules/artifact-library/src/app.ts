import type { Hono } from "hono";
import { Hono as HonoApp } from "hono";
import {
  InlineContentStore,
  mountArtifacts,
  runArtifactMigrations,
  type ArtifactDb,
  type ContentStore,
  type Identity,
} from "@corbits/artifact-core";
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
  "postgres://postgres:postgres@localhost:5459/ex_artifacts";

// This app's whole directory: two people, no agents. Naming a principal is the
// HOST's job — the package owns artifacts, not a people directory — so a host
// this small answers the seam from a Map rather than standing up control-plane
// tables it does not otherwise need.
const DIRECTORY: Record<string, string> = {
  avery: "Avery Ash",
  briar: "Briar Birch",
};

const identity: Identity = {
  async ownerNames(_tenantId, ownerPrincipalIds) {
    return new Map(ownerPrincipalIds.map((id) => [id, DIRECTORY[id] ?? null]));
  },
  // No agents in this app, so nothing resolves to a human owner…
  async ownerMemberPrincipalId() {
    return null;
  },
  // …and every principal is a person.
  async principalIdsByKind(_tenantId, kind) {
    return kind === "user" ? Object.keys(DIRECTORY) : [];
  },
  // Single-tenant: a cross-tenant read is always refused.
  async ownerIsMemberOfTenant() {
    return false;
  },
};

export type MountOpts = {
  /** Where the bytes live is a port, and the host picks it at mount time. */
  contentStore?: ContentStore;
  /** Who counts as an administrator is the host's policy, never the core's. */
  isAdmin?: boolean;
};

export async function buildApp(): Promise<{
  /** One pool, one session, one mount per call — the ContentStore is chosen here. */
  appFor: (opts?: MountOpts) => Hono<AppEnv>;
  app: Hono<AppEnv>;
  db: ArtifactDb;
  signIn: (session: Session) => void;
}> {
  const hub = createDB(pgConfig(DATABASE_URL));
  const db: ArtifactDb = hub.db;

  // Boot-time, once. Idempotent, advisory-locked, and it keeps its own ledger
  // (`corbits_artifact_core_migrations`) — this app's own migration
  // bookkeeping is untouched by it.
  await runArtifactMigrations(db);

  let signedIn: Session = { tenantId: "acme", principalId: "avery" };
  const getSession = staticSessions(() => signedIn);

  // Mounted @corbits/* modules serve under `/api`, the prefix Interchange
  // serves its own routes under (`app.route("/api/me", …)`). The core
  // registers its routes root-relative, so nest them in a sub-app and route
  // that at `/api`. No `/v1` segment, no vendor prefix.
  const appFor = (opts?: MountOpts): Hono<AppEnv> => {
    const api = new HonoApp<AppEnv>();
    mountArtifacts(api, {
      db,
      contentStore: opts?.contentStore ?? InlineContentStore,
      resolvePrincipal: resolveTenantPrincipal,
      identity,
      adminAuthz: { isAdmin: async () => opts?.isAdmin === true },
    });
    return bareInterchangeApp(hub, getSession).route("/api", api);
  };

  return {
    appFor,
    app: appFor(),
    db,
    signIn: (session) => {
      signedIn = session;
    },
  };
}
