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

henka runs nothing itself. An adapter runs the tests and applies the mutants. [keiko](../keiko) ships one for web games:

```bash
npx keiko mutate
```

```
✔ caught   player.speed 140 → 0
✖ missed   player.speed 140 → 600
- unviable 30 fps instead of 60

missed: no test failed, so nothing tests what these change. Add a test of the behaviour they control.
  player.speed 140 → 600
```

## Writing an adapter

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

- `baseline()` and `run()` return `{ failed, passed, durationMs }`, with `failed` listing the failing tests by name. `run()` can return `{ unviable: "why" }` instead.
- `mutants()` is called after the baseline, so an adapter can list what the baseline run saw.
- `mutate()` throws `BaselineError` when the baseline has failures: a mutant can't be judged against a failing suite.
- `writeOut()` writes `outcomes.json` and one `<outcome>.txt` per outcome, a mutant per line, for CI and agents.

henka has no dependencies and needs Node 22.4 or later.

## License

MIT
