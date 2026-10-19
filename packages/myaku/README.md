# myaku

**A frame profiler for web games.** myaku (脈, "pulse") watches every frame your game draws. It finds the ones players feel drop and tells you why, in plain words:

> Frame 1,204 took 41 ms (budget 25 ms). 28 ms was script: `spawnWave` in src/enemies.ts:88.
> *This ran inside the game loop. Profile the function in the Performance panel, or spread the work over several frames.*

It works with any engine (Phaser, PixiJS, three.js, KAPLAY, Excalibur, hand-written loops, debuff) and needs no changes to the game.

```bash
npm install -D myaku
```

```ts
// First line of your entry file, in development only:
import "myaku/auto";
```

That's it. A small graph appears in the corner. Hover it to hold it still, and click a red spike to see why that frame was slow. Alt+M toggles it.

## Why not just DevTools?

DevTools profile pages. myaku profiles games:

- **It's always on.** You don't record a session and hope the stutter happens during it. myaku keeps the last ten seconds of frames, so when you feel a hitch, it's already there.
- **It gives verdicts, not flame charts.** Every slow frame gets a cause, a confidence and a next step.
- **It counts what games care about:** frame time as players feel it, time in your frame code, draw calls, GPU uploads, shader compiles, and heap drops (GC).
- **It's built for tools and agents.** `profiler.report()` is plain JSON, and `window.__MYAKU__` is there for anything that drives the page.

## What it can tell you

| Cause | What it means | How myaku knows |
| --- | --- | --- |
| `script` | Your code ran long | The browser's [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames) entries name the script and function. Without them, it uses frame code time and your spans |
| `gc` | Garbage collection | The heap shrank by megabytes while your code was idle |
| `upload` | Textures or buffers sent to the GPU mid-play | Counted on the WebGL context, with bytes |
| `compile` | Shaders compiled mid-play | Counted on the WebGL context |
| `layout` | Style and layout work | Long Animation Frames |
| `throttled` | The browser slowed frames (hidden window, power saving) | A run of slow frames with the game idle |
| `hidden` | The tab was in the background | `visibilitychange` |
| `unknown` | Your code was quick; the time went elsewhere (GPU, compositor) | Says so, with low confidence, rather than guessing |

Each verdict has a `confidence` (`high`, `medium` or `low`). Low confidence means "a lead, not an answer".

## API

```ts
import { myaku, overlay } from "myaku";

const profiler = myaku();       // start (before the game creates its canvas context)
overlay(profiler);              // the corner graph (optional)

profiler.span("physics", () => world.step(dt)); // time your own systems
const end = profiler.begin("ai"); /* … */ end();

profiler.report();   // JSON: percentiles, hitches per minute, causes, the worst hitches explained, spans
profiler.hitches();  // every slow frame in the buffer, explained
profiler.explain(0); // the latest frame (or n frames ago)
profiler.frames(60); // raw frames, oldest first
profiler.stop();     // restore everything myaku wrapped
```

| Option | Default | |
| --- | --- | --- |
| `size` | `600` | Frames kept |
| `budgetMs` | 1.5× the display's frame interval | Slower frames are hitches. myaku measures the display: 25 ms at 60 Hz, 12.5 ms at 120 Hz |
| `contexts` | `true` | Wrap canvas contexts to count draws, uploads and compiles |
| `global` | `true` | Expose the profiler as `window.__MYAKU__` |
| `engines` | `true` | Add engine spans automatically (see below) |

## Engines

myaku adds `update` and `render` spans for the engine's own loop, so a slow frame says whether game logic or drawing took the time:

| Engine | How | Spans |
| --- | --- | --- |
| PixiJS 8 | Automatic, through Pixi's devtools hook | `update` (your ticker listeners), `render` |
| three.js | Automatic, through three's devtools hook | `render` |
| Phaser 3, or Phaser from a script tag | Automatic, through the global `Phaser` | `update`, `update:<scene key>`, `render` |
| Excalibur | Automatic, through Excalibur's devtools global | `update`, `render` |
| KAPLAY | Automatic with its default globals; `adapt(profiler, k)` with `global: false` | `update`, `render` |
| Phaser 4 (ES modules), or anything else | `adapt(profiler, game)` | Same as Phaser 3 |
| debuff | `debuff dev` | `update`, `render` |

Each row is checked against the real engine by the repo's local [`compat/`](https://github.com/debuffjp/debuff/tree/main/compat) suite (`npm run compat`). `node compat/real.mjs` also records four open-source games, two Phaser 3 and two PixiJS 8 (see keiko's [real games](https://github.com/debuffjp/debuff/tree/main/tooling/keiko#real-games)), and checks they report frames, draws and these spans with no change to the game.

```ts
import { adapt, myaku } from "myaku";
const game = new Phaser.Game(config);
adapt(myaku(), game);
```

Spans can nest: `update:level` is part of `update`.

A `Report` has `frames`, `seconds`, `fps`, `budgetMs`, `displayIntervalMs`, `intervalMs` (p50/p95/p99/max, which is what players feel), `cpuMs` (p50/p95/max time in frame code), `hitches`, `hitchesPerMinute`, `causes`, `worst` (up to 10 verdicts), `spans` (average ms per frame), `perFrame` (draws, uploads, bytes), `overheadMs` (myaku's own cost), `support` (what this browser reports) and `warnings`.

**Check `warnings` before trusting a quiet report.** myaku says when it can't see something: no frames (the game kept its own `requestAnimationFrame` from before myaku loaded), no canvas context (created before myaku loaded), span names past the limit (added up under `other`), or a heap reported too coarsely to see GC. The overlay shows the same warnings. `profiler.warnings()` returns them at any time.

## Recording and budgets in CI

`npx myaku record` plays your game in Chrome or Edge with myaku injected, so it needs no changes to the game and works on a production build. It prints frame-time percentiles and the worst hitches, and fails when you set a budget and the game goes over it:

```bash
npm run build
npx myaku record dist --seconds 20 --cpu 4 --p95 20 --hitches 6
```

- **Target:** a folder (served locally, default `dist`) or a URL (your dev server, staging).
- **`--play file.mjs`:** a module whose default export, `async (page) => {}`, plays the game with Playwright's `page` (press keys, click Play). Without it, myaku records whatever the game does by itself.
- **`--cpu 4`:** slow the CPU down, like a mid-range phone.
- **Budgets:** `--p95 <ms>`, `--p99 <ms>`, `--hitches <per minute>`. Exit code 1 when one is over, 2 on errors.
- **`--json`, `--out report.json`:** the full report and budget results, for CI artifacts and agents.
- **`--warmup <s>`** (default 1), **`--viewport 1280x720`**, **`--headed`:** settle time before recording, window size, and showing the browser.

Timings depend on the machine, so set budgets from runs on the same CI runner. It uses the Chrome or Edge you have installed (`MYAKU_BROWSER` to pick one).

## What it sees that the browser doesn't tell you

Chromium's [Long Animation Frames](https://w3c.github.io/long-animation-frames/) API (LoAF) is the best signal a page gets about slow frames, and myaku uses it. Games need more than it gives:

| | Long Animation Frames | myaku |
| --- | --- | --- |
| Which frames | Over 50 ms (three game frames) | Over 1.5× the display interval (25 ms at 60 Hz), including frames whose timestamps look on time |
| Where in the game loop | The one `requestAnimationFrame` callback | The game's own callback and source line, then engine spans (`update:<scene>`, `render`) found automatically |
| GPU work | Not covered | Draw calls, texture and buffer uploads with bytes, shader compiles |
| Garbage collection, throttling, hidden tabs | Not covered | A verdict for each, or `unknown` when it can't tell |
| Browsers | Chromium | Every browser, with attribution in Chromium |

On a Phaser game slowed by a 70 ms and a 30 ms function, 8 seconds of play produced 3 LoAF entries and 7 real hitches. myaku reported all 7.

## How it works

- **Frames:** myaku wraps `requestAnimationFrame`. A frame's interval runs from its start to the next frame's start, which is the gap the player sees, and is never shorter than the frame's own code. Chrome can stamp the frame after a 30 ms callback right back on the 16.7 ms grid, which hides the overrun from timestamps. Its CPU time is the time the frame callbacks ran.
- **GPU work:** myaku wraps the methods of each canvas context the game creates, counting `draw*` calls, texture and buffer uploads (with bytes), and shader compiles and links.
- **Attribution:** Chromium's Long Animation Frames entries report which scripts ran during slow frames. Because myaku's wrapper sits in front of your frame callbacks, myaku records where each callback was registered (one stack capture per distinct callback) and points at that instead.
- **Almost no garbage:** frames live in fixed-size typed arrays, so profiling doesn't cause the GC it looks for. What myaku allocates per frame (a callback wrapper, span closures) is a few small short-lived objects. Overhead is typically under 0.1 ms per frame and is reported as `overheadMs`.
- **Engines found where they announce themselves:** PixiJS's and three.js's devtools hooks, Excalibur's devtools global, Phaser's and KAPLAY's globals. Nothing is added to the game. PixiJS can call its hook before its ticker exists, so myaku finishes hooking up once `init()` has run.
- **Spans that ran always count:** browsers round `performance.now()`, so cheap work often measures 0 ms. A span that ran still shows up (as 0 ms), so "the engine wasn't hooked up" and "the engine was fast" look different.
- **Warm-up:** the first 10 frames (scripts compiling, assets decoding) aren't counted as play.

## Browser support

Capture works everywhere. Script attribution (`script` with a location, and `layout`) and heap drops (`gc`) need Chromium. myaku checks that heap readings actually change from frame to frame. If a browser reports the heap too coarsely, `support.heap` is `false`, there are no `gc` verdicts, and `unknown` verdicts say GC can't be ruled out. Elsewhere, verdicts fall back to frame code time and spans, and say so.

## Limits

- **Engine loops hide your code.** When an engine owns the loop, attribution names the engine's file. The [engine spans](#engines) say whether update or render took the time, and in Phaser which scene. Add `profiler.span()` around your own systems to go further.
- **Contexts created before myaku starts aren't counted.** Import `myaku/auto` first.
- **`myaku record` needs Chromium** (Chrome or Edge).
- **No GPU timing yet.** "GPU bound" shows as `unknown` with a draw-call hint.

## With debuff

`debuff dev` starts myaku for you, with debuff's update and render as spans. Agents get it through the MCP server's `game_profile` tool.

The design is recorded in [ADR 0011](https://github.com/debuffjp/debuff/blob/main/docs/adr/0011-frame-profiler.md).

## License

MIT
