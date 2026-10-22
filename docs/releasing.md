# Releasing

[`release.yml`](../.github/workflows/release.yml) versions and publishes from CI. Nobody runs `npm publish` by hand.

## Cutting a release

1. In each PR with user-facing changes, run `npx changeset` and commit the changeset file.
2. When changesets land on `main`, the workflow opens or updates a **Version packages** PR that bumps versions and changelogs. Run the Matrix workflow on it before merging.
3. Merge that PR. The next Release run finds no pending changesets and runs `npm run release:ci`: it builds, runs `changeset publish` (publishes every package whose version isn't on npm yet and tags it), points the Claude plugin and desktop extension at the new `@debuffjp/mcp` (committing that change), and pushes `main` and the tags. The tags matter: `create-debuff` downloads templates from its own tag, so a missing tag breaks `npm create debuff`.

If a publish stops partway, re-run the Release workflow (Actions → Release → Run workflow). It skips packages that are already on npm.

## npm trusted publishing

CI authenticates to npm with OIDC trusted publishing: there is no `NPM_TOKEN` secret, and every publish carries a provenance attestation. Each package needs a trusted publisher configured once on npmjs.com (package → Settings → Trusted publishing → GitHub Actions): organization `debuffjp`, repository `debuff`, workflow `release.yml`, no environment. Once it works, set the package's publishing access to "Require two-factor authentication and disallow tokens".

A brand-new package can't be configured before it exists, so publish its first version locally (`npm login`, then `npm run release`), then add the trusted publisher.

## Publishing locally (fallback)

```bash
git checkout main && git pull
npm ci
npm login
npm run release
```

`npm run release` runs `npm run check` first, then does what `release:ci` does. npm asks for your second factor. Local publishes don't carry provenance.

## MCP Registry

`@debuffjp/mcp` is listed on the official MCP Registry as `jp.debuff/debuff`, verified by a DNS TXT record on debuff.jp. The signing key lives only on the maintainer's machine, in `.debuff/mcp-registry/key.pem`, which is git-ignored. After an npm release of `@debuffjp/mcp`, update the listing from the repo root (PowerShell or any shell):

```bash
node tooling/mcp/scripts/publish-registry.mjs
```

It generates `tooling/mcp/server.json` from package.json (so the version matches npm), fetches `mcp-publisher` if needed, signs in with the DNS key and publishes.
