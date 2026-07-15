# Interchange tool credential bridge blocker

As of 2026-07-15, `@intx/tools-x` can be uploaded, resolved, verified,
extracted, and activated by a deployed Interchange sidecar, but a credential
selected by an agent definition is not delivered to the loaded tool factory.

## Reproduction

The deployed smoke-test agent used this configuration:

```json
{
  "toolPackages": [
    { "name": "@intx/tools-x", "version": "0.1.0" }
  ],
  "credentialRequirements": [
    {
      "providerName": "X",
      "source": "tenant",
      "name": "X_OAUTH1_CREDENTIAL"
    }
  ]
}
```

The tenant credential was active, belonged to the `X` provider, and carried
the `@intx/tools-x/oauth1-json-v1` atomic OAuth1 format documented in the
package README. The same OAuth1 values successfully called X's
`GET /2/users/me` endpoint outside the sidecar.

The sidecar successfully materialized `@intx/tools-x@0.1.0`; its durable run
then recorded this sequence before any inference or X request occurred:

```text
RunStarted
StepStarted
StepFailed: @intx/tools-x requires an X_ACCESS_TOKEN credential in the tool environment
RunFailed
```

## Root cause

This is a missing Interchange launch/runtime bridge, not an invalid X token or
an OAuth signature failure:

1. `packages/hub-api/src/routes/instances.ts` stores agent credential
   requirements but the launch path resolves only model sources and grants.
   It passes the prompt, grants, inference sources, and `toolPackagePins` to
   `deployInstanceAtHead`; it does not resolve or forward
   `credentialRequirements`.
2. The deploy/session wire shape has no dedicated payload for resolved tool
   credentials.
3. `apps/sidecar/src/workflow-substrate-factory.ts` builds each step tool
   environment with inference sources, storage, authorization, directors, and
   mail transport, but no named credential map or injected credential values.
4. The workflow host's `credentialsSnapshot` contains step authorization
   grants. Despite its name, it does not contain provider secrets.
5. The loaded X factory therefore sees neither `X_OAUTH1_CREDENTIAL` nor the
   four individual OAuth1 variables and fails closed before making a network
   request.

The same gap was confirmed in the Railway fork commit
`2c10f848756300c20b6354bc329c81f73a80d574` and upstream Interchange commit
`d8472ef82d900ce2a7fddaeac6856fc62db9b6ea`. Updating from the former to the
latter does not add the missing bridge.

## Required Interchange behavior

The Interchange-side fix needs to:

1. Resolve agent `credentialRequirements` at launch using tenant, creator, and
   invoker context.
2. Validate authority to use each selected credential.
3. Transport the resolved secrets over the authenticated sidecar channel.
4. Expose them through a scoped tool runtime interface. A dedicated
   `env.credentials`-style map is preferable to mutating global `process.env`.
5. Keep secrets out of deploy git trees, prompts, run events, API responses,
   and logs.
6. Cover reconnect, redeploy, teardown, and credential rotation.

The acceptance test for the bridge is:

```text
agent credential requirement
  -> control-plane credential resolution
  -> authenticated sidecar delivery
  -> X tool factory receives X_OAUTH1_CREDENTIAL
  -> getUsersMe returns the authenticated X user
```

Do not work around this in a shared deployment by placing an X credential in
the Railway sidecar's global environment. That bypasses tenant-scoped
credential resolution and exposes the secret to every tool package running in
that sidecar service.
