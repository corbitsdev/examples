# mailbox-inbox

Mounts [`@corbits/mailbox-core`](../../cores/mailbox) on an Interchange host
(`createApp` from `@intx/hub-api`) and drives it the way a product would:
something delivers mail, the signed-in user lists it, opens one, marks it read.
Then the two properties you actually depend on in production — a retried
delivery does not duplicate, and one principal never sees another's mail.

## Run

Needs a Postgres. Anything works; the default points at the one in the
[modules README](../README.md).

```sh
bun install                 # from the repo root
bun run start               # asserts, then exits
bun run serve               # the same app on a port (PORT=3101 by default 3000)
```

Point it elsewhere with `EXAMPLES_DATABASE_URL`:

```sh
EXAMPLES_DATABASE_URL=postgres://user:pass@localhost:5432/mydb bun run start
```

`bun run start` truncates `principal_mail` on every run, so give it a database
you do not mind it owning.

## What to read

- `src/app.ts` — the mount. Migrations, the host's triage vocabulary, and
  `mountMailbox`.
- `src/index.ts` — the proof.

The vocabulary is worth a second look: `priority` and `status` have no defaults
anywhere in the package, because a default would make one product's taxonomy
every adopter's. The ordered `priorities` list *is* the ranking `?sort=priority`
uses and the enum `?priority=` validates against.
