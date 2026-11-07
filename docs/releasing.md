# Releasing

[`release.yml`](../.github/workflows/release.yml) versions and publishes from CI. Nobody runs `npm publish` by hand.

## Cutting a release

1. In each PR with user-facing changes, run `npx changeset` and commit the changeset file.
2. When changesets land on `main`, the workflow opens or updates a **Version packages** PR that bumps versions and changelogs. With the `CHANGESETS_TOKEN` secret set (see below), the PR gets normal CI. Without it, the workflow dispatches CI on it instead, because PRs opened by the workflow token get no CI of their own. The PR is updated even when that run's publish failed.
3. Merge that PR. The next Release run runs `npm run release:ci` before anything else, even if new changesets have landed since: it builds, runs `changeset publish` (publishes every package whose version isn't on npm yet and tags it), points the Claude plugin and desktop extension at the new `@debuffjp/mcp` (committing that change), and pushes `main` and the tags. The tags matter: `create-debuff` downloads templates from its own tag, so a missing tag breaks `npm create debuff`.

If a publish stops partway, re-run the Release workflow (Actions → Release → Run workflow). It skips packages that are already on npm.

## CI on the Version packages PR

Set a repository secret `CHANGESETS_TOKEN`: a fine-grained personal access token (or a GitHub App token) for `debuffjp/debuff` with **Contents** and **Pull requests** read and write. The Release workflow then opens and pushes the Version packages PR as that account, so its `pull_request` CI runs like any PR's.

Without the secret, the workflow's own `GITHUB_TOKEN` opens the PR. GitHub holds that PR's `pull_request` run at "action_required" and marks it failed, with no jobs, when the PR merges. Those runs are noise, not test failures: the dispatched CI run on the same commit is the real check, and it reports to the PR as a commit status. From late October to early November that noise was 62 of the 86 non-success runs on the Actions page.

## The spryte mirror

After publishing, the Release workflow runs `scripts/sync-spryte-mirror.mjs`, which copies `packages/spryte` to [debuffjp/spryte](https://github.com/debuffjp/spryte) when the versions differ. It needs the secret `SPRYTE_MIRROR_TOKEN` (contents write on that repo) and skips with a warning without it. Commits to the package by anyone but the maintainer are replayed first, so the mirror lists them as authors; one that doesn't apply gets a `Co-authored-by` line on the sync commit. Run the script with no flags for a dry run, or with `--push` to sync using your own git credentials. Change the mirror through this repo: its own `.github`, `docs/brand`, `docs/charts` and lockfile are the only files a sync leaves alone.

## npm trusted publishing

CI authenticates to npm with OIDC trusted publishing: there is no `NPM_TOKEN` secret, and every publish carries a provenance attestation. Each package needs a trusted publisher configured once on npmjs.com (package → Settings → Trusted publishing → GitHub Actions): organization `debuffjp`, repository `debuff`, workflow `release.yml`, no environment. Once it works, set the package's publishing access to "Require two-factor authentication and disallow tokens".

A brand-new package can't be configured before it exists, so publish its first version locally (`npm login`, then `npm run release`), then add the trusted publisher. `scripts/check-first-publish.mjs` catches a missed one. CI runs it on pull requests as a warning, and Release runs it before publishing, failing with these steps instead of `changeset publish`'s raw E404. Before it existed, henka's first release failed eight Release runs in a row until it was published by hand.

For a minute or two after that first publish, npm says the package "is being processed" and the registry shows only a `0.0.0-stage` placeholder ("Temporary package placeholder for staged publishing"). That isn't a staged release: `npm stage list` is empty and there's nothing to approve. Wait, then check with `npm view <name> versions --prefer-online` (npm caches the placeholder otherwise, and `npm install` fails with `ETARGET`). Once the real version is up, `npm deprecate <name>@0.0.0-stage "placeholder"` keeps anyone from installing the placeholder by name.

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

## Papercuts

A commit whose message says `Fixes papercut #12` marks papercut #12 fixed in the new version on
[papercuts.debuff.jp](https://papercuts.debuff.jp). The Release workflow does it after publishing, and only
when that push published a new version (secret `PAPERCUTS_FIX_TOKEN`, which can mark entries fixed and do
nothing else). It never fails the release.
