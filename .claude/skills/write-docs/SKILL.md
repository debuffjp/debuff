---
name: write-docs
description: Document a debuff change everywhere it shows up (JSDoc, package READMEs, agent skills, debuff.jp in English and Japanese, changesets), keeping the docs for old behaviour. Use for any change to public API, CLI, MCP tools or behaviour, and when renaming or deprecating anything.
---

# Writing docs for a debuff change

A change isn't done until its docs are. Docs ship to debuff.jp before the release goes to GitHub and npm.

## 1. List every place that mentions the thing

Search for the old name or behaviour before editing:

```bash
git grep -n "<name>" -- '*.md' '*.ts' ':!**/CHANGELOG.md'
```

Then the same in `D:/docs-live` (the debuff.jp source), which covers `docs/`, `ja/docs/`, `spryte/`, `keiko/`, `myaku/`, `plonk/` and `blog/`.

The places that usually need an edit:

| Where | What |
| --- | --- |
| `packages/*/src` | JSDoc on the changed export. TypeDoc builds the API pages from it. |
| `packages/*/README.md`, `tooling/*/README.md` | Examples and option lists. |
| `plugins/debuff/skills/*/SKILL.md` and `plugins/openai/debuff/skills/*` | What agents are told. Keep both copies in step. |
| `D:/docs-live/docs/*.md` | The guide pages. |
| `D:/docs-live/ja/...` | The Japanese copy of every English page you touch. |
| `.changeset/*.md` | One changeset per user-facing change (`npx changeset`). |

## 2. Keep the old docs (hard rule)

People on older versions still read the docs. Never delete docs for something deprecated, renamed or changed in behaviour. Keep them and add the version:

- Renamed: "Deprecated in 0.21: use `squish`." Keep the old section below the new one.
- Changed behaviour: "Before 0.21, `x` returned `y`." Then the new behaviour.
- Removed: keep the section, headed "Removed in 0.21", with what to use instead.

This applies to JSDoc (`@deprecated Since 0.21: use squish`), READMEs, skills and both languages on debuff.jp. If a diff deletes a doc section, check that it was moved or marked, not lost.

Find the version from the next release the changeset will produce (the fixed `@debuffjp/*` version plus the bump).

## 3. Write it

- English site copy: follow the `write-post` skill in `D:/docs-live`. `npm run lint:en` checks names, British spelling, em dashes and stock AI phrases.
- Japanese: follow the `translate-ja` skill there. `npm run check:ja` lists missing or stale pages.
- Apply the `unslop` skill to READMEs, changesets and commit messages.
- "debuff" is lowercase in prose.
- Code examples import from the package that owns the API.

## 4. Check it

In this repo:

```bash
npm run check
```

In `D:/docs-live`:

```bash
npm run build
npm run check:ja
npm run lint:en
```

`npm run deploy` there runs the checks again and publishes debuff.jp. Deploying is the maintainer's call: say the docs are ready, then deploy only if asked.
