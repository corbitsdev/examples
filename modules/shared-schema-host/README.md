# shared-schema-host

Two cores on **one** host, sharing one database but living in a Postgres schema
of the host's choosing rather than in `public`.

This is the question every adopter with an existing database asks: *will these
packages create tables next to mine?* They will, unless you tell the connection
otherwise. The cores emit **unqualified** table names; `@intx/db` pins
`search_path` on the connection; the tables land wherever that points. Neither
core knows the schema's name, and neither takes a parameter for it.

What it checks:

- both cores migrate into the host's schema, ledgers included;
- none of their tables leak into `public`;
- a second, unpinned connection to the same database cannot resolve
  `principal_mail` at all — which is the isolation the schema buys;
- both cores then work normally over HTTP through the shared `search_path`;
- re-running both migration runners against the schema adds and destroys
  nothing.

## Run

```sh
bun install                 # from the repo root
bun run start               # asserts, then exits
bun run serve               # the same app on a port
```

`EXAMPLES_DATABASE_URL` overrides the database; the schema name is
`CORE_SCHEMA` in `src/app.ts`. The host creates the schema itself —
`search_path` says where to look, it does not create anything.

## What to read

- `src/app.ts` — `pgConfigInSchema`, the schema creation, and the two mounts.
- `src/index.ts` — the proof.
