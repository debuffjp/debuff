# Mutation testing on juice

How much do `@debuffjp/juice`'s tests check? Line coverage says 94%. This folder holds a mutation run of the same
package by henka and one by StrykerJS, and a script that compares their verdicts.

```bash
node bench/mutation/compare.mjs
```

```
henka:   266 mutants, 134 caught, 132 missed
Stryker: 362 mutants, 232 killed or timed out (64.1%; 71.2% of the 326 on code that ran)
shared:  152 mutants (8 match more than one of Stryker's), 152 with the same verdict
Stryker only: 43 survived on code that ran, by mutator { ConditionalExpression: 20, LogicalOperator: 8, … }
henka misses: { uncovered: 20, branch: 15, equivalent: 18, tuning: 10, gap: 69 }
```

Both runs were on 2026-11-06 on Windows 11 with Node 24.15.0 and Vitest 5.0.5, on juice 0.30.0 as at debuff 645d6112 (360 lines of
source, 9 tests).

| File | What made it |
| --- | --- |
| `results/2026-11-06-win32-juice-henka.json` | `node tooling/henka/bin/henka.js packages/juice/src --jobs 2 --json` at the repo root (henka 0.1.0) |
| `results/2026-11-06-win32-juice-stryker.json` | StrykerJS 10.1.1 with `stryker.json` and `vitest.mutation.config.ts` copied to the repo root. Absolute paths and file sources removed. |
| line coverage | `npx vitest run packages/juice --coverage.enabled --coverage.include='packages/juice/src/**'`: 93.75% of lines (135 of 144) |

Stryker needed three changes to run on this repo: `tsconfigFile` pointed at a file that doesn't exist (its tsconfig
preprocessor calls a function TypeScript 7 no longer exports), a Vitest config of its own without `test.projects`
(`vitest.mutation.config.ts` here) and a sandbox that keeps every tsconfig the root references.

`triage.json` sorts henka's 132 misses by reading each against the source: on code that never ran (whole lines, or a branch of a line that ran), equivalent (no change a test could observe), a default tuning value, or a gap. Each call has its reason, so it can be checked.

Two mutants count as the same when they change the same line of the same file to the same text. Two identical edits on one line can't be told apart that way, so a henka mutant that matches several of Stryker's agrees when any of them does. Stryker makes
mutants henka doesn't (conditions forced true or false, strings, arrays, objects and method calls) and henka makes some Stryker
doesn't (number literals, and function bodies replaced by a value of their return type), so each count has mutants the other lacks.

Caveats: one small package. The two runs had different background load, so their times don't compare:
henka took 10 min 38 s with the CPU at 97% from other work, Stryker 5 min 17 s on a quieter machine. The write-up is
[What 94% line coverage missed](https://debuff.jp/research/what-coverage-missed).
