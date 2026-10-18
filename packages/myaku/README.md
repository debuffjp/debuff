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

A `Report` has `intervalMs` (p50/p95/p99/max, which is what players feel), `cpuMs` (time in frame code), `hitches`, `hitchesPerMinute`, `causes`, `worst` (up to 10 verdicts), `spans` (average ms per frame), `perFrame` (draws, uploads, bytes), `overheadMs` (myaku's own cost) and `support` (what this browser reports).

## How it works

- **Frames:** myaku wraps `requestAnimationFrame`. A frame's interval runs from its start to the next frame's start, which is the gap the player sees. Its CPU time is the time the frame callbacks ran.
- **GPU work:** myaku wraps the methods of each canvas context the game creates, counting `draw*` calls, texture and buffer uploads (with bytes), and shader compiles and links.
- **Attribution:** Chromium's Long Animation Frames entries report which scripts ran during slow frames. Because myaku's wrapper sits in front of your frame callbacks, myaku records where each callback was registered (one stack capture per distinct callback) and points at that instead.
- **No allocations per frame:** frames live in fixed-size typed arrays, so profiling doesn't cause the GC it looks for. Overhead is typically under 0.1 ms per frame and is reported as `overheadMs`.
- **Warm-up:** the first 10 frames (scripts compiling, assets decoding) aren't counted as play.

## Browser support

Capture works everywhere. Script attribution (`script` with a location, and `layout`) and heap drops (`gc`) need Chromium. Elsewhere, verdicts fall back to frame code time and spans, and say so.

## Limits

- **Engine loops hide your code.** When an engine owns the loop (Phaser, PixiJS), the slow callback is the engine's step function, so attribution names the engine's file. Add `profiler.span()` around your own systems to see inside it.
- **Contexts created before myaku starts aren't counted.** Import `myaku/auto` first.
- **No GPU timing yet.** "GPU bound" shows as `unknown` with a draw-call hint.

## With debuff

`debuff dev` starts myaku for you, with debuff's update and render as spans. Agents get it through the MCP server's `game_profile` tool.

The design is recorded in [ADR 0011](https://github.com/debuffjp/debuff/blob/main/docs/adr/0011-frame-profiler.md).

## License

MIT
