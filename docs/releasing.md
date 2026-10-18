# Releasing

CI prepares releases and a maintainer publishes them from their own machine. [`release.yml`](../.github/workflows/release.yml) never publishes to npm.

## Cutting a release

1. In each PR with user-facing changes, run `npx changeset` and commit the changeset file.
2. When changesets land on `main`, the workflow opens or updates a **Version packages** PR that bumps versions and changelogs.
3. Merge that PR, then publish locally:

   ```bash
   git checkout main && git pull
   npm ci
   npm login
   npm run release
   ```

   `npm run release` runs `npm run check`, then `changeset publish`, which publishes every package whose version isn't on npm yet and tags the release, then points the Claude plugin and desktop extension at the new `@debuffjp/mcp` (committing that change) and pushes `main` and the tags. npm asks for your second factor while publishing. The tags matter: `create-debuff` downloads templates from its own tag, so a missing tag breaks `npm create debuff`.

If a publish stops partway, run `npm run release` again. It skips packages that are already on npm.

Local publishes don't carry npm provenance attestations.

## MCP Registry

`@debuffjp/mcp` is listed on the official MCP Registry as `jp.debuff/debuff`, verified by a DNS TXT record on debuff.jp. The signing key lives only on the maintainer's machine, in `.debuff/mcp-registry/key.pem`, which is git-ignored. After an npm release of `@debuffjp/mcp`, update the listing from the repo root (PowerShell or any shell):

```bash
node tooling/mcp/scripts/publish-registry.mjs
```

It generates `tooling/mcp/server.json` from package.json (so the version matches npm), fetches `mcp-publisher` if needed, signs in with the DNS key and publishes.
