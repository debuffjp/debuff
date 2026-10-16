# Releasing

debuff publishes to npm from GitHub Actions ([`release.yml`](../.github/workflows/release.yml)) using npm [trusted publishing](https://docs.npmjs.com/trusted-publishers). The workflow authenticates with a short-lived OIDC token, so there is no `NPM_TOKEN` secret and no 2FA prompt, and every version gets a provenance attestation.

## One-time setup per package

Do this on npmjs.com for every published package: each `@debuffjp/*` package and `create-debuff`. New packages must be published once by hand before they can be configured.

1. Open the package's **Settings** page and find **Trusted Publisher**.
2. Pick **GitHub Actions** and enter exactly (case-sensitive):
   - Organization or user: `debuffjp`
   - Repository: `debuff`
   - Workflow filename: `release.yml` (file name only, not the path)
   - Environment: leave empty
3. Allow direct **`npm publish`**. Configurations created after 3 Sep 2026 default to `npm stage publish` only, which stages every CI version for manual 2FA approval. That is exactly what we want to avoid.
4. Optional, once CI publishing works: under **Publishing access**, require 2FA and disallow tokens, so only the workflow can publish.

npm doesn't validate this configuration when you save it. A mistake shows up as a failed publish in the workflow log.

Once every package is configured, delete the `NPM_TOKEN` repository secret.

## Cutting a release

1. In each PR with user-facing changes, run `npx changeset` and commit the changeset file.
2. When changesets land on `main`, the workflow opens or updates a **Version packages** PR that bumps versions and changelogs.
3. Merge that PR. The workflow runs `npm run release` (`npm run check && changeset publish`) and publishes every bumped package.

Don't publish from your own machine: local publishes can't carry provenance.

## A version stuck in staging

If a version ends up staged and can't be approved, or you reject it, npm never reuses that version number. Add a patch changeset for the affected package (for example 0.1.0 → 0.1.1) and release again. To find staged versions, use the package page on npmjs.com or `npm stage list` (needs interactive login).
