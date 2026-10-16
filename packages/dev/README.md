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
| `step(n)` | advances `n` fixed steps, returns `state()` |
| `params()` / `setParam(group, key, value)` | typed parameter schemas and values |
| `press(code)` / `release(code)` | keyboard |
| `tap(x, y)` / `pointerDown` / `pointerMove` / `pointerUp` | pointer, in logical coordinates |
| `errors()` | uncaught errors since load |
| `capture()` | PNG data URL of the current frame |

Open the page with `?debuff-scenario` to stop the loop so time advances only through `step()`. `debuff scenario` uses this mode.
