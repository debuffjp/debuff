---
"@debuffjp/core": minor
---

Plugin API additions from building the first plugins outside this repo:

- `game.hooks.renderScene((draw, render) => ...)` wraps `beforeRender` and the scene's render, so a plugin can draw the world through a render target, `filter()` or shader. `afterRender` stays outside it.
- `game.emit` called from a `gameEvent` listener now waits until the current event has reached every listener. Before, later listeners saw the second event first.
- `@debuffjp/core/testing` exports `createTestGame()`, a `Game` that runs under happy-dom or jsdom for unit-testing plugins.
