// The Interchange host every example mounts onto.
//
// Each `@corbits/*` README says "mount it onto any Interchange host" and shows
// a two-line `mountX(app, opts)` call. None of them says what producing that
// `app` takes, so this file is the missing half — and it lives here, once,
// because it is the SAME in every example. What differs between examples is
// the mount call, and that stays in the example.
import { createApp, type AppEnv } from "@intx/hub-api";
import { createDB } from "@intx/db";
import {
  createEventCollectorRegistry,
  createSidecarRouter,
  type SessionService,
  type SidecarAuthenticator,
} from "@intx/hub-sessions";
import type { Context, Hono } from "hono";

/** `@intx/db` takes discrete connection fields, not a URL. */
export function pgConfig(raw: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port === "" ? "5432" : url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

/**
 * The same connection, pinned to one Postgres schema.
 *
 * `@intx/db` puts `search_path` on the connection, so every unqualified table
 * name a mounted core writes resolves there. That is how several cores share
 * one database without their tables landing in the host's `public`.
 */
export function pgConfigInSchema(raw: string, schema: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port === "" ? "5432" : url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    schema,
  };
}

/** Who the hub believes is signed in. */
export type Session = { tenantId: string; principalId: string } | null;

const EPOCH = new Date(0);

/**
 * A `getSession` for a host that authenticates somewhere else entirely.
 *
 * Authentication is the host's, not the module's: a real deployment hands
 * `createApp` a better-auth handler and never writes anything like this. An
 * example that stood up a real login would be teaching login, not mounting, so
 * this returns a fully-formed user/session pair for whoever `read()` names and
 * the examples flip that variable the way a browser would flip a cookie.
 */
export function staticSessions(read: () => Session) {
  return async () => {
    const session = read();
    if (session === null) return null;
    const id = `${session.tenantId}:${session.principalId}`;
    return {
      user: {
        id,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        email: `${session.principalId}@${session.tenantId}.example`,
        emailVerified: true,
        name: session.principalId,
      },
      session: {
        id: `session-${id}`,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        userId: id,
        expiresAt: new Date(Date.now() + 3_600_000),
        token: `token-${id}`,
      },
    };
  };
}

/**
 * The one seam every core requires the host to implement: who is this request?
 *
 * The core cannot answer it — it does not own authentication, and the answer
 * is whatever the host's session middleware already decided. Here that is the
 * hub's authenticated user, whose id this host composes as `tenant:principal`.
 */
export function resolvePrincipal(
  ctx: unknown,
): { tenantId: string; principalId: string } | null {
  const user = (ctx as Context<AppEnv>).get("user");
  if (!user) return null;
  const [tenantId, principalId] = user.id.split(":");
  return tenantId && principalId ? { tenantId, principalId } : null;
}

/**
 * The same answer, spelled the way `@corbits/artifact-core` and
 * `@corbits/analytics-core` currently declare `ResolvedPrincipal`.
 * `@corbits/mailbox-core` has moved to `{ tenantId, principalId }` and the
 * other two have not, so a host mounting all three needs both spellings until
 * they converge. One decision, two shapes — never two decisions.
 */
export function resolveTenantPrincipal(
  ctx: unknown,
): { tenant: string; principal: string } | null {
  const resolved = resolvePrincipal(ctx);
  return resolved === null
    ? null
    : { tenant: resolved.tenantId, principal: resolved.principalId };
}

/**
 * `createApp` demands a `SessionService`. A host that serves no agent sessions
 * has nothing to put there, so all six verbs refuse loudly rather than
 * pretending to be implemented.
 */
function noAgentSessions(): SessionService {
  const refuse = (verb: string) => (): never => {
    throw new Error(`this host runs no agent sessions: ${verb}`);
  };
  return {
    stageWorkflowStep: refuse("stageWorkflowStep"),
    deployInstanceAtHead: refuse("deployInstanceAtHead"),
    deploySingleStepAtHead: refuse("deploySingleStepAtHead"),
    deployWorkflowDefinition: refuse("deployWorkflowDefinition"),
    sendUserMessage: refuse("sendUserMessage"),
    endSession: refuse("endSession"),
  };
}

/**
 * `createSidecarRouter` requires an authenticator: without one a handshake
 * could route on an unverified frame claim. These hosts accept no sidecars at
 * all, so every handshake is rejected.
 */
const rejectSidecars: SidecarAuthenticator = async () => null;

export function bareInterchangeApp(
  hub: ReturnType<typeof createDB>,
  getSession: ReturnType<typeof staticSessions>,
): Hono<AppEnv> {
  return createApp({
    getSession,
    authHandler: () => new Response("", { status: 404 }),
    db: hub.db,
    sidecarRouter: createSidecarRouter({ authenticateSidecar: rejectSidecars }),
    sessionService: noAgentSessions(),
    eventCollectors: createEventCollectorRegistry({ db: hub.db }),
    assetService: null,
    repoStore: null,
    maxTarballBytes: 10_000_000,
  });
}

export { createDB, type AppEnv };
