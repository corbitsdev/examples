# analytics-rollups

Mounts [`@corbits/analytics-core`](../../cores/analytics) on an Interchange
host, feeds it a stream of **native `@intx` inference events**, and checks the
two properties the package sells:

1. the daily rollup agrees with the raw facts, and a redelivered event changes
   neither;
2. a rebuild from scratch lands byte-identical to the incrementally-maintained
   rollup it replaces — proven by skewing the rollup on purpose first and
   watching the rebuild *correct* it rather than accumulate on top.

Every event in `src/index.ts` is a real member of the published
`@intx/types` `InferenceEvent` union — no casts, nothing invented. The
provider and model on those events are fixture values; the package stores
whatever the stream reports and privileges none of them.

## Run

```sh
bun install                 # from the repo root
bun run start               # asserts, then exits
bun run serve               # the same app on a port
```

`EXAMPLES_DATABASE_URL` overrides the database. `bun run start` truncates the
`analytics_*` and `workflow_*_fact` tables on every run.

## One thing that will catch you

`AnalyticsSummary.turnCount` is the **completed** count, not the total. A failed
run lands in `failedTurnCount` and nowhere else, so the number of runs that
ended is the sum of the two.

## What to read

- `src/app.ts` — the mount, including the two host seams: agent display names
  and attribution.
- `src/index.ts` — the proof.
