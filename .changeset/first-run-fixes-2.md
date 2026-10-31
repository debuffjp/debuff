---
"@debuffjp/cli": patch
"create-debuff": patch
---

Fixes from a first-run test, where fresh agents went from debuff.jp to a playable game:

- `debuff scenario` says when it wrote new baselines (saved without a check, so look at them before committing), and after a full run lists baselines no scenario takes any more, such as a template's after you replace its scenario.
- Renaming a save key on a game nobody has played yet: the build error now says `--accept-saves` is safe then.
- The `launch.url` warning says where to set it (`launch: { url }` in debuff.config.ts).
- `debuff test` outside a project says there's no package.json, instead of "No tests yet".
- `debuff fuzz` prints a line after each run, so its default three minutes aren't silent.
- `npm create debuff`'s next steps describe `npm test` as logic tests then screenshot scenarios, which is what it runs.
- The setup skill says which of the two MCP servers to use and that the dev server may pick another port; the templates' agent guides say how long fuzzing takes; the CLI README warns that long scenario waits are slow.
