# @debuffjp/dev

Dev-only inspection and control hooks that let browser tools, the `debuff` CLI and AI agents see and drive a running game.

```ts
import { devTools } from "@debuffjp/dev";

if (import.meta.env.DEV) game.use(devTools({ input }));
```

Bundlers drop the call from production builds, and `debuff build` fails if it leaks.

## `window.__DEBUFF_DEV__`

All arguments and return values are JSON-serialisable.

| Method | Returns |
| --- | --- |
| `state()` | `{ scene, tick, time, frozen, stats, camera, state, pluginNames, plugins }`. `camera` is the centre, zoom and view size in world units, `state` is the active scene's `inspect()`, and `plugins` holds `game.inspect` snapshots |
| `step(n)` | pauses, advances `n` fixed steps, returns `state()` |
| `pause()` / `resume()` / `speed(scale)` | live control; `state().pausedBy` says who paused, and `state().hidden` (since 0.25) says the tab is in the background, where the loop stops until you `step()` |
| `frames(n)` | the latest `n` frame breakdowns: interval, update and render ms, catch-up steps, quads, draw calls, long tasks |
| `notes()` | moments flagged in the overlay, with state and frames |
| `params()` / `setParam(group, key, value)` | typed parameter schemas and values |
| `press(code)` / `release(code)` | keyboard, plus `"PointerRight"` / `"PointerMiddle"` for the right and middle mouse buttons |
| `tap(x, y, kind?)` / `pointerDown(x, y, kind?)` / `pointerMove` / `pointerUp` | pointer, in logical coordinates. `kind` is `"mouse"` (default), `"touch"` or `"pen"`: the game sees it in `pointer.kind`, and a touch or pen press is contact 1 in `pointer.touches` rather than a mouse press too |
| `wheel(dy, dx?)` | wheel scroll in CSS pixels this step |
| `touchDown(id, x, y, kind?)` / `touchMove(id, x, y)` / `touchUp(id)` | touch contacts (or `"pen"`); the first is the primary pointer. Recorded in replays |
| `errors()` | runtime errors since load, explained: `kind` (`your-code`, `debuff-usage`, `debuff-bug`, `outside`), source-mapped `where`, `hint`, `count` |
| `capture(fit?, background?)` | PNG data URL of the current frame. `fit` letterboxes it: `"social"` (1200×675, for X and Bluesky posts and link cards) or `[width, height]`, scaled by whole pixels so pixel art stays crisp. `fit` added in 0.24 |
| `clips(on?)` / `saveClip(name?)` | rolling clip recording: `clips(true)` keeps the last 15 s, `saveClip` writes it to `.debuff/captures/` (MP4 where the browser can record it, else WebM) and returns `{ file, seconds, bytes, mimeType }`. Live games under `debuff dev`. Added in 0.24 |
| `keepForReload()` | save the session for a state-preserving reload; the `debuff dev` client calls it just before a code change reloads the page |
| `luminance(cols, rows, region?)` | the current frame's WCAG relative luminance on a grid, for the scenario flash and contrast checks |
| `events(sinceTick?)` | the latest `game.emit` calls with tick and detail; `state().events` counts them by name |
| `rewind(tick)` | reload and replay this session's inputs to `tick`, then pause: the exact state at that moment. Within the known session you can go forward again until new play branches off. Live games only |
| `replay(toTick?)` | everything played since load (keys, pointer, param changes) up to `toTick`, as a scenario that replays it exactly, plus `warnings` for anything it can't reproduce. Needs `devTools({ input })` |

## Overlay

`devOverlay()` adds a panel. The backquote key hides it, and the ▾ button (or double-clicking the header) collapses it to a single bar with fps, an error count and the agent badge. The panel remembers whether it's collapsed and which tab is open.

In automated browsers (`navigator.webdriver`, as under scenario runs and agent harnesses) the overlay starts hidden, so it stays out of screenshots and taps; the toggle key still shows it, and `devOverlay({ open: true })` keeps it visible. Before 0.15 it started open there too.

The toolbar has pause, step, speed (1x, ½×, ¼×), **snap** (download the current frame as a PNG), **rec** and **clip** (keep the last 15 s and save them as a video in `.debuff/captures/`, for devlogs, store pages and `debuff ship press`; added in 0.24) and **restart** (re-enter the current scene). Below it are four tabs:

- **perf**: a frame graph coloured by health: lime is on time, amber is a little late (normal display jitter) and red is a dropped frame. Update and render time are stacked inside each bar. A summary shows your headroom and whether recent dropped frames came from the game's own work or from outside it (GC, the browser, other tabs). Click a bar to pause and inspect that frame with a plain-words diagnosis, or tick **pause on dropped frame**. Phases also appear as `debuff:update` and `debuff:render` in the browser profiler.
- **tune**: sliders for every `game.params` group. Values you've changed from their defaults turn amber. Double-click a name to reset it, and **copy changes** copies just your changes, ready to paste into the param definitions.
- **state**: your scene's `inspect()` data and plugin snapshots, updating live.
- **log**: runtime errors, each labelled with whose problem it is (your code, a call debuff rejected, a debuff bug, or something outside the game), with a link that opens the exact source line in your editor, a hint, and a report link for debuff bugs. Also an activity log of who changed what (you, an agent or a scenario) with undo, and notes you can flag for agents. **save replay** and **copy replay** turn the session so far into a scenario that `debuff scenario` plays back exactly, and **save as scenario** writes it to `scenarios/` (through `debuff dev`) with a capture at the end, as a regression test. The **timeline** slider rewinds: drag to any tick and the page reloads, replays your inputs to that tick and pauses there. Drag forward again to return, until you play on from the earlier point.

## Keep your place on reload

Under `debuff dev`, editing your code no longer sends you back to the start. Just before the page reloads, the dev tools save the session's inputs. The new code then replays them to the tick you were on (without drawing, typically a few milliseconds per hundred ticks), and the game carries on running, or stays paused if it was paused. The log says how long the replay took.

Because the inputs are replayed with the **new** code, a change to how the game plays shows up right where you were: lower the run speed and the player is where they'd be at the new speed. Keys you were holding are let go after the replay. Pass `devTools({ input, keepState: false })` to turn it off.

## Agent link

Under `debuff dev`, the page listens for commands from `@debuffjp/mcp` over the dev server, so agents work on the game you're looking at. Pass `agentLink: false` to opt out.

Open the page with `?debuff-scenario` to stop the loop so time advances only through `step()`. `debuff scenario` uses this mode.
