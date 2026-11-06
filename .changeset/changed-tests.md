---
"keiko": minor
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
---

Run only the tests a change touches. Every `debuff test` (and `npx keiko`) run now records which functions of the game each test ran and which files it loaded, at a few percent of run time. `debuff test --changed` then runs only the tests that are new, failed last time, or used code or files that changed since they last passed; the rest are counted as unchanged. An edit inside a function no test calls, or a type-only edit, runs nothing. `--queue <name>` keeps a separate record, so a pre-push hook with `--changed --queue push` still covers everything since the last push. The MCP `run_tests` tool takes `changed: true`.

The guidance agents get in new projects (AGENTS.md, the debuff and keiko skills, the MCP prompts) now keeps test suites small: a new mechanic gets one test, a fix or tweak goes into the existing test for that mechanic, fuzz findings replay inside the test of the mechanic they broke, and agents run `--changed` after each edit and the whole suite once at the end. Projects created before this keep their AGENTS.md; `npx debuff doctor --fix` refreshes the skills.
