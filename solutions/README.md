# Solutions

Agent-driven, end-to-end examples. A solution is not "this package mounts" —
that is what [`modules/`](../modules) proves. A solution is an agent doing a job
a person would otherwise do, against real infrastructure.

| Solution | What it does |
| --- | --- |
| [inbox-triage](./inbox-triage) | An agent reads a mounted `@corbits/mailbox-core` inbox and stamps `priority` / `classification` / `status` onto the rows |
| [engineering-agent-team](./engineering-agent-team) | A downloadable multi-agent team (Markdown agent + skill definitions) you drop into a repo. Not a runnable program — see its README |

## Running them

```sh
bun install       # from the repo root
bun run start     # from the solution's directory
```

Solutions need inference, and they take it entirely from the environment — no
default provider, endpoint or model. Configure one against a local server or a
hosted vendor per the
[root README](../README.md#inference-configured-never-assumed); [`@corbits/example-kit`](../packages/example-kit/src/inference.ts)
in each solution is the whole resolver.

`inbox-triage` also needs the Postgres described in the
[modules README](../modules/README.md#postgres).
