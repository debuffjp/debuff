---
name: myaku
description: Use when a browser game stutters, hitches, drops frames, lags or feels janky, or the user asks to profile a web game's performance. Works with any engine (Phaser, PixiJS, three.js, KAPLAY, Excalibur, a hand-written loop, debuff). myaku records every frame and explains each slow one in plain words (the script and function, garbage collection, GPU uploads, shader compiles, layout or browser throttling).
---

# Finding out why a web game stutters, with myaku

myaku (脈, "pulse") is a frame profiler for games. It keeps the last ten seconds of frames, and for every hitch gives a verdict: a cause, a confidence and a hint. Read its verdicts instead of guessing from code.

Docs: https://debuff.jp/myaku/ · Verdicts: https://debuff.jp/myaku/verdicts

## Set up

In a debuff project, nothing to do: `debuff dev` runs myaku, and the MCP tool `game_profile` returns its report. Otherwise:

```bash
npm install -D myaku
```

Load it **before** the game's code, so it sees the canvas context and the loop, in development only:

```html
<script type="module">import "myaku/auto";</script>
<script type="module" src="/src/main.ts"></script>
```

PixiJS 8, three.js and Phaser 3 get `update` and `render` spans automatically. For Phaser 4 (ES modules), add `import { adapt, myaku } from "myaku"; adapt(myaku(), game);` after creating the game.

## Profiling

1. Have the human play (or drive the game) for a few seconds **in a visible, focused window**. Hidden or covered windows are throttled; myaku reports those frames as `throttled`, not as the game's fault.
2. Read the report from the page: `window.__MYAKU__.report()` (browser automation, or ask the human to paste it from the console). In debuff projects, call `game_profile`.
3. **Check `warnings` first.** If myaku saw no frames or no canvas context, it loaded too late: move it before the game's script and measure again.
4. Read `worst`: each verdict has `cause`, `confidence`, `summary`, `hint` and, for scripts, `where` (file and function).

## Acting on causes

- `script` with `where`: read that function. Spread its work over frames, cache, or move it to load time.
- `script` with only spans: compare `update` and `render`, then wrap the game's own systems with `profiler.span("physics", () => …)` and measure again to narrow it down.
- `upload`: textures or buffers created mid-play (text and canvas textures are common). Create them at load time and reuse them.
- `compile`: a shader compiled on first use. Warm materials and effects up while loading.
- `gc`: allocation in hot paths. Reuse objects and avoid per-frame arrays and closures.
- `layout`: DOM changes or layout reads every frame.
- `throttled`, `hidden`: the browser, not the game. Ask the human to measure with the window in front.
- `unknown`, low confidence: say so. Don't invent a cause.

Measure again after every fix, and compare p95/p99 frame time (`intervalMs`), not averages.
