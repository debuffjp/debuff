# Versioning and stability

All `@debuff/*` packages and `create-debuff` share one version number and release together.

## While 0.x

- **Minor** (`0.x.0`) releases may contain breaking changes. Each one is listed under "Breaking" in the changelog with migration steps.
- **Patch** (`0.x.y`) releases never break anything.
- Pin to a minor range (`~0.4.0`) if you need stability.

## From 1.0

Strict [semantic versioning](https://semver.org/): breaking changes only in majors, and anything removed is deprecated for at least one minor release first.

## What counts as public API

- Everything exported from a package's main entry and documented in its README.
- CLI commands, flags and `--json` output shapes.
- The scenario file format (`@debuff/cli/schema/scenario.schema.json`).
- The `window.__DEBUFF_DEV__` surface (`DevHooks.version` increments on breaking changes).
- The asset manifest format (`version` field).

Anything not exported or not documented is internal and may change in any release.
