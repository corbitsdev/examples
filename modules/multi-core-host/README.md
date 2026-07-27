# multi-core-host

All **three** `@corbits` cores mounted on **one** Interchange host, sharing one
database, one connection pool, and one identity decision. This is the
configuration a real adopter reaches for, and the one the per-core reference
hosts never covered.

The checks are about coexistence rather than per-core behaviour — the other
module examples cover that:

- **Migrations coexist.** Three independent runners, three separate ledgers
  (`corbits_mailbox_core_migrations`, `corbits_artifact_core_migrations`,
  `corbits_analytics_core_migrations`), no shared table names. Order is not
  load-bearing: none of the three has a foreign key into another or into the
  host, so they can run in whatever order boot reaches them.
- **One identity decision satisfies all three seams.** The host answers "who is
  this request?" once. Note the two spellings: `@corbits/mailbox-core` takes
  `{ tenantId, principalId }`, the other two still take `{ tenant, principal }`.
  That is one decision rendered twice, not two decisions — see
  `resolvePrincipal` and `resolveTenantPrincipal` in
  [`@corbits/example-kit`](../../packages/example-kit/src/host.ts).
- **Route surfaces do not collide.** `/api/me/inbox`, `/api/artifacts` and
  `/api/analytics/*` each keep their own payloads after all three mounts, and
  the host's own `/status` still answers.
- **A cross-core flow works.** An agent's work is counted by analytics, its
  output is stored as an artifact, and a mailbox message announces it carrying
  the artifact id as a `ref`.

## Two things worth knowing before you do this

**Only the migration ledgers are namespaced.** The data tables are plain,
unprefixed nouns — `artifact`, `upload`, `analytics_event`, `principal_mail`,
`mailbox`. What keeps three cores from colliding is that they picked disjoint
names, not a prefix convention protecting you. If your host already owns an
`artifact` or an `upload`, that is a real conflict — and
[shared-schema-host](../shared-schema-host) shows the fix.

**Where a core lands decides who gates it.** Interchange declares
`app.use("/api/me/*", requireAuth)`, so the mailbox is refused by the host with
a `401` that never reaches the core. Artifacts and analytics land on ungated
prefixes and answer their own no-principal behaviour: an empty `200` on an
aggregate read, `403` on anything naming a specific identity.

## Run

```sh
bun install                 # from the repo root
bun run start               # asserts, then exits
bun run serve               # the same app on a port
```

`EXAMPLES_DATABASE_URL` overrides the database. `bun run start` truncates all
three cores' tables on every run.
