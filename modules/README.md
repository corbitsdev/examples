# Modules

One entry per `@corbits/*` module: mount it on an Interchange host and prove it
works. Each entry is a runnable program that asserts its own behaviour against a
real Postgres and exits non-zero if anything fails.

These are minimal integration proofs, not solutions. They answer "does this
module mount, and does it behave?" — nothing more. For an example of a module
being *useful to an agent*, see [`solutions/`](../solutions).

| Module example | What it proves |
| --- | --- |
| [mailbox-inbox](./mailbox-inbox) | `@corbits/mailbox-core`: deliver → list → read → mark-read, dedupe on retry, cross-principal isolation |
| [artifact-library](./artifact-library) | `@corbits/artifact-core`: create → version → download, over both `ContentStore` backends |
| [analytics-rollups](./analytics-rollups) | `@corbits/analytics-core`: ingest native events → rollups → rebuild-from-scratch equivalence |
| [multi-core-host](./multi-core-host) | **All three on one host.** Migration coexistence, one identity decision, no route collisions |
| [shared-schema-host](./shared-schema-host) | **Two cores in a schema of your choosing.** One `search_path`, no tables in `public` |

## Where the routes land

Every entry mounts under **`/api`** — the prefix Interchange serves its own
routes under (`app.route("/api/me", …)`, `app.route("/api/tenants", …)`). There
is no `/v1` segment and no vendor prefix. The cores register their routes
root-relative and take no base path, so the host nests them:

```ts
const api = new Hono<AppEnv>();
mountMailbox(api, { db, bus, resolvePrincipal });
app.route("/api", api);
```

which serves `/api/me/inbox*`. Artifacts serve `/api/artifacts*`, analytics
`/api/analytics/*`. One consequence worth knowing before you copy this: a core
inherits whatever the host already declared for the prefix it lands on.
Interchange declares `app.use("/api/me/*", requireAuth)`, so the mailbox is
gated by the host and a signed-out caller gets a `401` that never reaches the
core — `multi-core-host` asserts exactly that, alongside artifacts and analytics
answering their own empty `200` on prefixes this host has not gated.

## Running them

```sh
bun install        # from the repo root — also builds the three cores
bun run modules    # from the repo root — runs all five
```

Each entry also runs on its own from its directory:

```sh
bun run start      # drives the app in-process and asserts, then exits
bun run serve      # binds the same app to a port so you can curl it
                   # PORT=3101 bun run serve
```

### Postgres

They need one. Any Postgres works; the default URL is
`postgres://postgres:postgres@localhost:5459/ex_<name>`, and every entry takes
`EXAMPLES_DATABASE_URL` to point somewhere else.

```sh
docker run -d --name corbits-examples-pg \
  -e POSTGRES_PASSWORD=postgres -p 5459:5432 postgres:16

for db in ex_mailbox ex_artifacts ex_analytics ex_multicore ex_shared_schema; do
  docker exec corbits-examples-pg psql -U postgres -c "CREATE DATABASE $db"
done
```

Each entry truncates its own tables on startup so it is re-runnable, so give it
a database you do not mind it owning.

None of these need inference — they exercise the module, not an agent.

## Where the packages come from

`@corbits/mailbox-core`, `@corbits/artifact-core` and `@corbits/analytics-core`
are not on npm yet. Until they are, this repo vendors their repositories as git
submodules under `cores/` and resolves them as bun workspace members. The
`@intx/*` packages they peer-depend on come from npm at `0.2.2`, pinned in the
root `package.json` catalog.

```
cores/mailbox    -> corbitsdev-mailbox
cores/artifacts  -> corbitsdev-artifacts
cores/analytics  -> corbitsdev-analytics
```

They resolve through each package's normal `exports` map to its built `dist`.
`dist/` is gitignored inside each core, so
the root `postinstall` builds all three; if you check out a core at a new
commit, re-run `bun install` (or `bun run build:cores`) before running an
example.

## Where the boilerplate went

Every `@corbits/*` README says "mount it onto any Interchange host" and shows a
two-line `mountX(app, opts)` call. None of them says what producing that `app`
takes: a session reader, a sidecar router, an event-collector registry, and a
`SessionService` whose every verb throws because these hosts run no agent
sessions.

That is the same in every example, so it lives once in
[`@corbits/example-kit`](../packages/example-kit) — along with the assertion
helpers and the environment-driven inference resolver. What is *not* shared is
the mount: each entry keeps its own `src/app.ts` with the `mountX` call, the
seams that host supplies, and the reasons it supplies them. That file is the
lesson; the kit is the scaffolding around it.
