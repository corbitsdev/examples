# @corbits/example-kit

Scaffolding for the examples in this repo. Not a library to depend on, and not
the lesson — everything here is the part that is identical in every example, so
that each example's own files contain only the part that is not.

| Entry point | What it is |
| --- | --- |
| `./host` | An Interchange host: `createApp` wired with a session reader, a sidecar router, an event-collector registry, and a `SessionService` whose verbs throw because these hosts run no agent sessions. Plus the two identity functions every mount needs. |
| `./check` | `check` / `section` / `finish`. An example exits non-zero if anything fails. |
| `./serve` | Binds an example's app to `PORT`. |
| `./inference` | Resolves an inference source from the environment. No default endpoint, no default model, no privileged provider. |

Two things it deliberately does **not** do:

- It never calls `mountX`. Each example mounts its own cores, in its own
  `src/app.ts`, with its own seams. Hiding the mount would defeat the point of
  the repo.
- It never picks a provider, a model or an endpoint. `resolveSource` reads the
  environment and returns an error naming exactly what to export.

`staticSessions` is worth reading before you copy anything: authentication is
the host's, and a real deployment hands `createApp` a better-auth handler. The
examples fake it so that flipping "who is signed in" is one assignment, which
is what makes the isolation checks readable.
