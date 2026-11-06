# ADR 0017: henka, mutation testing that keiko uses

- Status: accepted (first cut: behavioural mutants through keiko; source mutants for Vitest added before the first release)
- Date: 2026-11-06
- Related: ADR 0009 (keiko)

## Context

Agents write most of the tests in debuff games now, and passing tests can check very little. A trial of StrykerJS 10.1.1 on `@debuffjp/juice` measured 93.75% line coverage against a 64% mutation score; `particles.ts` was 96% lines and 51% mutation score, and reversing particle motion passed every test. Stryker needed three workarounds to run here (its tsconfig rewrite crashes on TypeScript 7, `test.projects` isn't supported, the sandbox must keep every referenced tsconfig), took about 0.9 s per mutant, never mutates number literals and can't see keiko tests.

cargo-mutants and mutant.cafe show the shape that works: a baseline run, mutants judged by whether a test fails, and results as files an agent can read. None of them knows about games: params, random seeds, frame rates.

## Decision

**henka** (変化, "change"), a standalone package (`henka` on npm, `tooling/henka`) with no dependencies. It knows nothing about games or test runners:

- An `Adapter` runs a baseline, lists mutants (after the baseline, so it can list what the baseline saw) and runs the tests with one mutant applied.
- Each mutant says what a good suite does with it: `noticed` (some test fails) or `ignored` (every test passes). That gives five outcomes: caught, missed, held, brittle and unviable.
- `mutate()` refuses a failing baseline. `writeOut()` writes `outcomes.json` and a text file per outcome.

**keiko** depends on henka and ships the first adapter, `keiko mutate`. Its first mutants change the game, not its code, so nothing is rebuilt:

- Params to each end of their range (`noticed`).
- A different `Math.random()` seed and 30 fps (`ignored`). Unviable for debuff games, which seed `game.random` and step on their own fixed step.

The runner applies a mutation in its booter, as a change to the game's defaults, before the test's own `play({ params })`.

## Source mutants

Added before henka's first release, so henka is useful without keiko: `npx henka` mutates a Vitest project's source.

- `henka/source` finds mutants in a file's syntax tree (Vite's oxc parser) and applies one as a text splice. Arithmetic, comparison boundaries, logic, sign, number literals and function bodies; string joins, types, imports and keys are left alone. `// henka-skip` and `// henka-skip-file` opt out.
- `henka/vite` is a Vite plugin that returns the mutated text for one file as it loads. Nothing on disk changes.
- `henka/vitest` runs the baseline in a Vitest process of its own, recording which test files load each source file (Vitest 5's `importDurations`). Each job then keeps a Vitest process open with that plugin and runs one mutant after another, invalidating only the mutated file. A mutant runs only the test files that load its file and stops at the first failure. Past a timeout (5x the baseline, at least 20 s) the process tree is killed, the mutant counts as caught and the next one gets a fresh process.

| Way | Per mutant | Catch | Disk |
| --- | --- | --- | --- |
| Schemata: every mutant behind a switch in one warm runner (Stryker) | no re-transform | instrumented code must survive other plugins; code that runs at import needs a reload | none |
| Patch a copy of the project (cargo-mutants) | a rebuild | a watcher can see half-written files | a copy per job |
| A warm Vitest per job, one mutated file per run (chosen) | one file re-transformed, its test files run | none found yet | none |

A fresh process per mutant was tried first and spent most of each run starting Vitest. Measured on `@debuffjp/juice` (2026-11-06, Windows 11, 2 jobs) against the Stryker trial: 266 mutants, 134 caught and 132 missed. Of the 152 mutants both tools make, the verdicts agree on all 152 (`bench/mutation`; 8 of them match two identical Stryker edits on one line by text). henka took 10 min 38 s, a median 3.4 s per mutant, with the CPU at 97% from other work; Stryker took 5 min 17 s on a quieter machine, so the two times don't compare directly. The likely cost, not yet measured on its own, is Vitest starting a worker and the test environment for every test file it runs.

## Later

- **Source mutants through keiko.** debuff games test with `debuff test`, which runs on keiko, not Vitest, so `npx henka` doesn't reach them. keiko's runner loads game code through Vite, so a keiko adapter can use `henka/vite` and `henka/source` as they are.
- **Source mutants** (built before the first release a different way, see [Source mutants](#source-mutants)) through a Vite plugin that compiles every mutant behind a switch. Vitest, keiko (Vite's module runner) and `debuff scenario` (a Vite dev server) all load code through Vite, so one plugin serves all three. Operators worth having for games: removing or doubling `dt`, `<` to `<=` in overlap checks, min/max swaps, sign flips, early-return removal, number literals (excluding values registered as params).
- **Diff-only runs** with a cap per file, as Google's mutation testing does, and an MCP `run_mutants` tool that returns a few survivors.
- **Input timing mutants** for replays (inputs a frame late, a press dropped). Left out of the first cut: a test that counts frames after a press is a fair test, so a one-frame shift would flag good tests.
- **Reusing test workers across henka runs.** Vitest starts a worker per test file on every run when the project isolates files, which is probably most of the 3.4 s per mutant on juice. An opt-in that turns isolation off for mutant runs could cut it, at the risk of tests that leak state between files.
- **Reusing the Vite server across mutants.** Each mutant restarts it now (about 4.6 s per mutant on `templates/platformer`).

## Consequences

- keiko has a second runtime dependency, our own. henka must be published before a keiko that depends on it.
- A mutant runs the whole suite. A param that sends the game into an endless synchronous loop hangs the run: keiko's per-test timeout can't interrupt it.
- Param mutants can be killed by tests that pin exact values, which would stop people tuning. The docs say to test the behaviour a param controls instead.
