---
"@debuffjp/cli": patch
---

`debuff scenario` says why when the game's dev hooks aren't ready within 15 s (`dev_hooks_missing`), and gives a fix for that cause: nothing in `src/` imports `@debuffjp/dev`, a request failed or the console logged an error while the page loaded (the first one is quoted), the page's URL lost `?debuff-scenario` before the dev tools started, or the game waits for something (a click, a sound unlock, a slow load) before installing them. Before 0.31.1 every case said the page "loaded without errors" and suggested adding `devTools` to `src/main.ts`, even when the game already had it.
