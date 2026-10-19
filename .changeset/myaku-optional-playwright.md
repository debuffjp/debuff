---
"myaku": minor
---

`playwright-core` is now an optional peer dependency, so using only the in-browser profiler no longer installs it. `myaku record` users need `npm install -D playwright-core`; without it, the CLI says so.
