# @intx/tools-x

Reusable Interchange tools for the X API. Phase 1 contains exactly the 23
operations in the Users table of the post-to-X workflow reference: 15 reads
and 8 account mutations.

The package calls the X API directly. It does not shell out to `xurl` and does
not forward requests to an MCP server.

## Authentication

The sidecar bundle reads one OAuth 2.0 user access token from
`X_ACCESS_TOKEN`. When deploying through Interchange, bind a credential with
that environment name to the agent instance. Local callers pass the token to
the factory directly:

```ts
import { createXTools } from "@intx/tools-x";

const tools = createXTools({ accessToken: process.env.X_ACCESS_TOKEN! });
```

The complete phase needs these user-token scopes across all operations:

```text
tweet.read users.read follows.read follows.write block.read
mute.read mute.write like.read like.write timeline.read tweet.write
```

An application-only bearer token is not sufficient for the full package.

## Users tools

Reads:

```text
getUsersMe getUsersById getUsersByIds getUsersByUsername
getUsersByUsernames getUsersPosts getUsersMentions getUsersTimeline
getUsersFollowers getUsersFollowing getUsersLikedPosts
getUsersRepostsOfMe getUsersBlocking getUsersMuting getUsersAffiliates
```

Mutations:

```text
followUser unfollowUser muteUser unmuteUser
likePost unlikePost repostPost unrepostPost
```

IDs are strings so JavaScript never loses precision. Array query values are
encoded as comma-separated X API parameters. Dotted wire keys such as
`tweet.fields` and `user.fields` are preserved in tool input schemas.

For authenticated-account operations, `id` or `source_user_id` must identify
the owner of `X_ACCESS_TOKEN`; X enforces this invariant. The four POST tools
keep their body fields at the top level of tool arguments:

- `followUser` and `muteUser`: `target_user_id`
- `likePost` and `repostPost`: `tweet_id`

## Interchange loader

The package exports the named sidecar factory `x` from
`@intx/tools-x/sidecar-bundle`. Its bundle id is
`@intx/tools-x/sidecar-bundle`, following the existing Interchange tool-package
convention.

## Package and upload

Build the self-contained Node ESM bundle and deterministic npm-style tarball:

```sh
bun run pack
bun run verify:package
```

The artifact is `dist/@intx-tools-x-0.1.0.tgz`. Its SHA-512 SRI, byte size,
and path are recorded in `dist/package-manifest.json`. Repeated builds produce
identical bytes.

Upload the verified artifact to a deployed Hub:

```sh
export HUB_URL=https://hub.example.com
export HUB_ADMIN_EMAIL=publisher@example.com
export HUB_ADMIN_PASSWORD='...'
export HUB_TENANT_SLUG=my-tenant
bun run upload
```

The uploader signs in without creating users or tenants, targets only the
direct `workspace-builtins` package-registry asset, and verifies the local,
upload-response, and post-upload SRI values. Remote tarballs use a full
SHA-512 content-addressed filename, making same-byte concurrent uploads
harmless while letting the registry reject different bytes for the same
package version without an overwrite. If the version already exists with
different bytes, increment the package version instead.

## Validation

```sh
bun test
bun run check
bun run pack
bun run verify:package
```
