# inbox-triage

An agent reads a mounted [`@corbits/mailbox-core`](../../cores/mailbox) inbox
and stamps triage back onto the rows.

The [`modules/`](../../modules) examples prove a core *mounts*. This one proves
a core is *useful to an agent*, which is a different claim. Mail is delivered
through the core's ingress seam, the agent opens each message through the same
HTTP routes a UI would use, decides `priority` / `classification` / `status`,
and writes that judgement back so the next reader of the mailbox sees it.

## Run

```sh
bun install     # from the repo root
bun run start   # from this directory
```

Needs a Postgres (default `postgres://postgres:postgres@localhost:5459/ex_mailbox`,
override with `EXAMPLES_DATABASE_URL`) and a configured inference endpoint.
Nothing about inference is defaulted — export either

```sh
export INTX_BASE_URL=http://localhost:11434/v1   # e.g. a local Ollama
export INTX_MODEL=qwen2.5vl:7b
export INTX_API_KEY=ollama
```

or a vendor key plus a model:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export INTX_MODEL=claude-sonnet-4-6
```

See the [root README](../../README.md#inference-configured-never-assumed).

The script truncates `principal_mail` on every run, so give it a database you
do not mind it owning.

Output is a before/after table read back through `GET /api/me/inbox` — the row state
itself, not a log line:

```
  BEFORE
  priority        classification  status          subject
  ----------------------------------------------------------------------------
  —               —               —               Contract for review before Friday
  —               —               —               Nightly job finished
  —               —               —               Invoice 4021 is ready
  —               —               —               ACTION REQUIRED: rotate your API credentials by Friday

  AFTER
  normal          legal           needs-action    Contract for review before Friday
  low             operations      done            Nightly job finished
  normal          billing         done            Invoice 4021 is ready
  high            security        needs-action    ACTION REQUIRED: rotate your API credentials by Friday
```

## What to read

- `src/index.ts` — the whole flow: deliver, read the before state, triage, stamp,
  read the after state, assert.
- `src/triage.ts` — the agent. One `@intx/agent` instance, no tools, one turn per
  message, JSON out. The allowed values come from the same host vocabulary the
  mailbox is mounted with, so the prompt, the validation and the route's
  `?priority=` enum cannot drift apart.
- `src/app.ts` — the mount, and the host's triage vocabulary, which is handed
  both to `mountMailbox` and to the agent so they cannot drift apart.

The Interchange host itself is shared scaffolding, in
[`@corbits/example-kit`](../../packages/example-kit); see the
[modules README](../../modules/README.md#where-the-boilerplate-went).

## The enrichment seam

Nothing in this example reaches past the package into its tables. That is the
point worth copying: `priority` / `classification` / `status` / `assignee` are
read *and* written through `@corbits/mailbox-core`'s own surface.

- **The updater.**
  `enrichMailboxMessage(db, { tenantId, principalId, id }, enrichment): Promise<boolean>`,
  scoped to `(tenant, principal)` and inbound like every other mutation. Each
  field is applied independently — an omitted key leaves the stored value alone,
  an explicit `null` clears it, so re-classifying an item does not silently wipe
  its priority. An enrichment that sets nothing throws `RangeError` rather than
  reporting a no-op as success.
- **The route.** `POST /api/me/inbox/:id/enrich`, body
  `{ priority?, classification?, status? }` validated by
  `MailboxEnrichmentSchema`. 400 on an unknown priority/status or an empty
  patch, 403 with no principal, 404 when no row is in scope. It publishes a
  change event on success, so an SSE subscriber sees the triage land.
  `POST /api/me/inbox/:id/assign` does the same for delegation — the item stays in
  this mailbox and carries the assignee's principal instead of being copied.
- **The filters.** `GET /api/me/inbox` honors `priority`, `classification`,
  `status` and `assignee`, plus `sort=date|priority`. `priority` and `status`
  are closed vocabularies, so a typo is a 400 rather than a silently empty page;
  `classification` and `assignee` are open host-defined strings. Filters are
  baked into the keyset cursor, so paging a filtered list into an unfiltered one
  is rejected rather than quietly skipping rows.

The example asserts all of this rather than only describing it: it stamps every
message through the route, then proves the filter *selects* — the rows returned
for `?priority=<p>` are exactly the rows the agent marked `p`, a priority no row
carries comes back empty rather than falling through to the whole inbox, a
typo'd priority is a 400, and `?sort=priority` returns the inbox most-urgent-first.

Triage is by definition a judgement made *after* delivery, so an insert-time-only
write half would have been the one moment an agent could not use. The seam closes
exactly that.

## A note on the model

There is no default model — you name one. `src/triage.ts` is written for the
weakest thing you might reasonably point it at, so it does not assume tool
calling: it asks for a JSON object, tolerates a markdown fence or a sentence of
preamble around it,
and retries once with the failure named. A second failure is reported as a
failed check rather than defaulted away — a triage example that silently
substitutes "normal" for a model that did not answer is not proving anything.
