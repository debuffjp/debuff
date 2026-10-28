---
name: add-package
description: Add a new package to the debuff monorepo (packages/* for browser runtime, tooling/* for Node). Use before creating any new workspace, and to review one that was just added.
---

# Adding a package

A new package is a new public promise: a name on npm, a line in the docs and something to keep tree-shakeable. Check first that it can't be a module in an existing package.

## 1. Decide where it goes

| Folder | For | Rules |
| --- | --- | --- |
| `packages/<name>` | Browser runtime | No Node APIs. `"sideEffects": false`. Dev-only code only inside `import.meta.env.DEV` or in `@debuffjp/dev`. |
| `tooling/<name>` | Node CLI, MCP, scaffolder | Node APIs are fine. |

Runtime dependencies need a trade-off note in the PR (AGENTS.md). Prefer writing the small piece yourself; if you must depend, wrap it in one module of ours that every caller goes through, so replacing it later touches one file.

If the package changes an architectural decision (a new layer, a new peer relationship), write an ADR in `docs/adr/` first.

## 2. Scaffold it

Copy the shape of `packages/juice` (the plainest runtime package):

- `package.json`: name `@debuffjp/<name>`, the shared `keywords`, `license`, `homepage`, `bugs`, `funding`, `repository.directory`, `"type": "module"`, `exports` with `types` before `default`, `files: ["dist", "README.md"]`, `scripts.build: "tsc -b"`, `publishConfig.access: "public"`. Start at the current version of the other `@debuffjp/*` packages: changesets keeps them `fixed` together.
- Other debuff packages it needs at runtime are `peerDependencies` (see `docs/architecture.md`), not `dependencies`.
- `tsconfig.json` extending `../../tsconfig.base.json` with `rootDir: src`, `outDir: dist`.
- `src/index.ts` as the only entry unless there is a reason for subpath exports.
- `test/*.test.ts`. The root `vitest.config.ts` picks up `packages/*/test` and `tooling/*/test` already.
- `README.md`: one-line summary, install, a short example, link to debuff.jp.

## 3. Register it

Each of these is a place that lists packages by hand:

- [ ] Root `tsconfig.json` `references`.
- [ ] Package table in the root `README.md`.
- [ ] The runtime package list in `docs/architecture.md` (runtime packages only).
- [ ] `D:/docs-live/typedoc.json` `entryPoints` for runtime packages.

A standalone spin-off with its own name (myaku, plonkjs, keiko) skips the last two. It gets its own section on debuff.jp instead, and its README row says "Standalone".
- [ ] Templates that should use it: their `package.json` (then `npm install` at the root).
- [ ] The agent skill `plugins/debuff/skills/debuff/SKILL.md` (and its copy under `plugins/openai/`), if game authors should reach for the package.

## 4. Check it

```bash
npm install
npm run check
```

`lint:packages` runs publint and attw on every non-private package, so a broken `exports` map fails here, not on npm. Report the template's brotli size from the build output if a template now imports the package.

Add a changeset (`npx changeset`) describing the package for users.

## 5. First publish

A brand-new name can't have a trusted publisher until it exists on npm. The first version is published locally; see `docs/releasing.md`. That's the maintainer's step: say it's needed, don't run it.

## 6. Document it

Follow the `write-docs` skill: a debuff.jp page in English and Japanese, and the docs ship before the release.
