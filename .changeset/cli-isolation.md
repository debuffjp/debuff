---
"@debuffjp/cli": minor
---

New `isolation` option in `debuff.config.ts` for games that use `SharedArrayBuffer` and worker threads. `debuff dev` sends the cross-origin isolation headers, `debuff build` writes them to `dist/_headers` for Cloudflare and Netlify (added to a `_headers` you ship yourself), `debuff doctor` warns about files `index.html` loads from other sites, and `debuff ship itch` reminds you to tick itch.io's SharedArrayBuffer option. `isolation: true` uses `embed: "require-corp"`; `{ embed: "credentialless" }` is easier on third-party files but Safari doesn't support it. See debuff.jp/docs/threads.
