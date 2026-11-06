# henka

**変化 (henka): change.** Mutation testing for any test runner: change one thing, then see whether your tests notice.

Coverage says which lines ran. It doesn't say whether a test would fail if those lines did something else. henka answers that. It runs your tests clean, then once per mutant (a small, deliberate change), and sorts each mutant by what happened:

| Outcome | Expected | What it means |
| --- | --- | --- |
| `caught` | a test fails | Good: something tests what this changes. |
| `missed` | a test fails | Nothing failed, so nothing tests what it changes. Write a test of that behaviour. |
| `held` | every test passes | Good: the tests shrug off a change they should ignore. |
| `brittle` | every test passes | A test failed under a change it should ignore, such as a different random seed or frame rate. |
| `unviable` | | The mutant couldn't be applied. |

## Vitest projects

```bash
npm install -D henka
npx henka                  # mutate src/
npx henka src/physics.ts   # one file or folder
npx henka --since main     # only lines changed since main
```

```
✔ caught   src/score.ts:3:15 hits * 2 → hits / 2
✖ missed   src/score.ts:2:12 hits < 3 → hits <= 3
✖ missed   src/unused.ts:1:40 n * 2 → n / 2

missed: no test failed, so nothing tests what these change. Add a test of the behaviour they control.
  src/score.ts:2:12 hits < 3 → hits <= 3
  src/unused.ts:1:40 n * 2 → n / 2: no test loads this file
```

henka reads each file with Vite's parser and makes these mutants:

| Change | Example |
| --- | --- |
| Arithmetic | `+` ↔ `-`, `*` ↔ `/`, `%` → `*`, `+=` ↔ `-=`, `*=` ↔ `/=`, `++` ↔ `--` |
| Comparison | `<` ↔ `<=`, `>` ↔ `>=`, `===` ↔ `!==`, `==` ↔ `!=` |
| Logic | `&&` ↔ `\|\|`, `!x` → `x` |
| Sign | `-x` → `x` |
| Numbers | `n` → `0`, `0` → `1` |
| Function bodies | emptied, or returning `0`, `""`, `true` or `false` to match the return type |

String joins, types, imports and object keys are left alone. Put `// henka-skip` on or above a line to skip it, or `// henka-skip-file` anywhere in a file.

henka first runs the tests related to your files with nothing changed, and notes which test files load each source file. Then each job (`--jobs`, half the cores up to 4 by default) keeps a Vitest process open and runs one mutant after another: a Vite plugin swaps in the changed code as the file loads, only the test files that load it run, and they stop at the first failure. Nothing on disk changes. A file no test loads is reported as missed without a run. A run that takes more than 5x the baseline (at least 20 s) is killed and counts as caught, since the mutant hung the tests; the next mutant gets a fresh process.

| Option | |
| --- | --- |
| `--since <ref>` | Only lines changed since a git ref. New files count in full. |
| `--jobs <n>` | Mutants to run at once. |
| `--timeout <s>` | Stop a run after this many seconds. |
| `--root <dir>` | Where Vitest finds its config. |
| `--out <dir>` | Where to write results (default `mutants.out`). |
| `--list` | Print the mutants without running them. |
| `--json` | Print the report as JSON. |

henka needs `vite` 8 and `vitest` 5 or later in the project.

## Web games

`npx henka` needs Vitest. debuff games test with `debuff test`, which runs on keiko, so use keiko's adapter there. It changes the game rather than its code: params to each end of their range, a different random seed and a lower frame rate.

```bash
npx keiko mutate
```

```
✔ caught   player.speed 140 → 0
✖ missed   player.speed 140 → 600
- unviable 30 fps instead of 60
```

## Writing an adapter

henka's core runs nothing itself. An adapter runs the tests and applies the mutants:

```ts
import { type Adapter, formatReport, mutate, writeOut } from "henka";

const adapter: Adapter = {
  name: "my-runner",
  baseline: () => runMyTests(),
  mutants: () => [{ id: "timeout=0", label: "request timeout 30 s → 0", expect: "noticed" }],
  run: (mutant) => runMyTests({ apply: mutant.id }),
};

const report = await mutate(adapter);
writeOut(report, "mutants.out");
console.log(formatReport(report));
```

- `baseline()` and `run()` return `{ failed, passed, durationMs, note? }`, with `failed` listing the failing tests by name. `run()` can return `{ unviable: "why" }` instead.
- `mutants()` is called after the baseline, so an adapter can list what the baseline run saw.
- `mutate()` throws `BaselineError` when the baseline has failures: a mutant can't be judged against a failing suite.
- `close()`, if the adapter has one, is called once at the end, after a failure too.
- `mutate(adapter, { jobs: 4 })` runs mutants at once, for adapters whose runs don't share state.
- `writeOut()` writes `outcomes.json` and one `<outcome>.txt` per outcome, a mutant per line, for CI and agents.

henka has no dependencies and needs Node 22.4 or later. `henka/source` finds and applies source mutants with any ESTree parser, and `henka/vite` is the Vite plugin, for adapters that load code through Vite.

## License

MIT
