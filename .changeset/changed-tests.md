---
"keiko": minor
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
---

Run only the tests a change touches. Every `debuff test` (and `npx keiko`) run now records which functions of the game each test ran and which files it loaded or replayed; in our measurements that made runs a few percent to about a third slower. `debuff test --changed` then runs only the test files with a test that is new, failed last time, or used code or files that changed since it last passed; the rest are counted as unchanged. An edit inside a function no test calls, or a type-only edit, runs nothing. A due file runs whole, since its tests can pass state to each other, so one test file per mechanic keeps reruns small. Changes to `.env` files, the Vite config and files it imports, tsconfig files, the lockfile and `package.json` run everything; debuff assets, `?raw` and `?inline` imports, `import.meta.glob` matches and linked packages outside the project count as changes. `--queue <name>` keeps a separate record, so a pre-push hook with `--changed --queue push` still covers everything since the last push. The MCP `run_tests` tool takes `changed: true`, and agents in new projects are told to use it after each edit.
