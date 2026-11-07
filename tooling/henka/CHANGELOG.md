# henka

## 0.1.1

### Patch Changes

- f14528c: `debuff test` and `npx keiko` no longer load test files written for another runner. Files under `tests/` or `src/` that import `node:test`, `vitest`, `bun:test` or `@jest/globals` are left out when keiko looks through a folder, so a project whose `npm test` runs `node --test` first doesn't run those unit tests a second time inside keiko (in one game that took `debuff test` from 369 s to 29 s). Naming such a file on the command line still runs it.
  
  The guidance agents get in new projects (AGENTS.md, the debuff and keiko skills, the MCP prompts and the `run_tests` description) now keeps one test per mechanic: search `tests/` first, put fixes, tweaks and fuzz replays into the mechanic's existing test, add a test only for a new mechanic, and ask the human before deleting a test. Henka's hint for a missed mutant says the same. Projects created before this keep their AGENTS.md; `npx debuff doctor --fix` refreshes the skills.
