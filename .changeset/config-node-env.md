---
"@debuffjp/cli": patch
---

Fix: a project with a `debuff.config.ts` built in development mode (loading the config through Vite set `NODE_ENV=development`), so `debuff build` failed its dev-leak check or, worse, could ship the dev tools. Loading the config now leaves `NODE_ENV` as it was.
