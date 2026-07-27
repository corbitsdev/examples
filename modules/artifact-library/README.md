# artifact-library

Mounts [`@corbits/artifact-core`](../../cores/artifacts) on an Interchange host
and uses it as a small document library: import something, revise it, read the
version history, then upload real files and download them byte for byte — over
**both** shipped `ContentStore` backends, because where the bytes live is a port
and the host gets to choose.

Also shows the identity seam implemented against a `Map`, which is what a host
with a two-person directory would actually write. The package owns artifacts,
not a people directory, so naming an owner is the host's job.

## Run

```sh
bun install                 # from the repo root
bun run start               # asserts, then exits
bun run serve               # the same app on a port
```

`EXAMPLES_DATABASE_URL` overrides the database. `bun run start` truncates
`artifact`, `artifact_version`, `upload` and `mail_attachment_ref` on every run.

## What to read

- `src/app.ts` — the mount, including the `ContentStore` and admin-authz
  choices, which are the host's and are made here.
- `src/index.ts` — the proof.
