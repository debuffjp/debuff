# compat

Checks keiko and myaku against the real engines their READMEs list. It runs locally, never in CI:

```bash
npm run compat              # build, install the engines, run every game
node compat/run.mjs pixi    # one game (after a first full run)
```

Each folder in `games/` is the same tiny game in a different engine: a player who walks right at 120 px/s while ArrowRight is held, plus a click counter. keiko plays each one headless with [`shared/suite.js`](shared/suite.js) (boot, keyboard, exact click position, seeded randomness, determinism). myaku records each one for 2 s in your installed Chrome or Edge and checks that it counts frames and draws, has no warnings, and finds the engine spans its README promises.

To add an engine, copy a game folder, pin the engine in `package.json` and add a row to both READMEs' tables. If a check fails, fix keiko or myaku, or correct the README. Don't loosen the check.
