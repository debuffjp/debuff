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

   `npm run release` runs `npm run check`, then `changeset publish`, which publishes every package whose version isn't on npm yet and tags the release, then pushes the tags. npm asks for your second factor while publishing. The tags matter: `create-debuff` downloads templates from its own tag, so a missing tag breaks `npm create debuff`.
4. If `@debuffjp/mcp` changed version, update the pinned version in `plugins/debuff/.mcp.json`, `plugins/debuff/.claude-plugin/plugin.json` and `tooling/mcp/mcpb/manifest.json`, then push. The Claude directory rescans `main`.

If a publish stops partway, run `npm run release` again. It skips packages that are already on npm.

Local publishes don't carry npm provenance attestations.
