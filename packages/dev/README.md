# @debuff/dev

Dev-only inspection and control hooks that let browser tools, the `debuff` CLI and AI agents see and drive a running game.

```ts
import { devTools } from "@debuff/dev";

if (import.meta.env.DEV) game.use(devTools({ input }));
```

Bundlers drop the call from production builds, and `debuff build` fails if it leaks.

## `window.__DEBUFF_DEV__`

All arguments and return values are JSON-serialisable.

| Method | Returns |
| --- | --- |
| `state()` | `{ scene, tick, time, frozen, stats, state, pluginNames, plugins }`. `state` is the active scene's `inspect()`, and `plugins` holds `game.inspect` snapshots |
| `step(n)` | pauses, advances `n` fixed steps, returns `state()` |
| `pause()` / `resume()` / `speed(scale)` | live control; `state().pausedBy` says who paused |
| `frames(n)` | the latest `n` frame breakdowns: interval, update and render ms, catch-up steps, quads, draw calls, long tasks |
| `notes()` | moments flagged in the overlay, with state and frames |
| `params()` / `setParam(group, key, value)` | typed parameter schemas and values |
| `press(code)` / `release(code)` | keyboard |
| `tap(x, y)` / `pointerDown` / `pointerMove` / `pointerUp` | pointer, in logical coordinates |
| `errors()` | uncaught errors since load |
| `capture()` | PNG data URL of the current frame |

## Overlay

`devOverlay()` adds a panel (toggle with the backquote key). It has pause, step, slow motion (½×, ¼×) and **pause on spike**, which freezes on the first frame over twice the budget. The graph stacks update (lime) and render (sky) time per frame. Click a bar to inspect that frame, with a plain-words diagnosis: a slow update, a heavy render, loop catch-up, or a browser stall outside the game. Params get sliders. An activity log records who changed what (you, an agent or a scenario), with undo. Phases also appear as `debuff:update` and `debuff:render` in the browser profiler.

## Agent link

Under `debuff dev`, the page listens for commands from `@debuff/mcp` over the dev server, so agents work on the game you're looking at. Pass `agentLink: false` to opt out.

Open the page with `?debuff-scenario` to stop the loop so time advances only through `step()`. `debuff scenario` uses this mode.
