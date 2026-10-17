# keiko

## 0.1.1

### Patch Changes

- d359aa1: `npx keiko` exits cleanly on Windows (no libuv assertion after the run), and the package links to its own README as its homepage.

## 0.1.0

First release: fast, deterministic logic tests for web games. The real game runs in Node with no browser, on a virtual clock (`requestAnimationFrame`, `performance.now`, `Date.now`, seeded `Math.random`), driven through debuff's dev hooks, an optional `window.__KEIKO__`, or DOM events. `play`, `until`, `during`, `trace`, `test.sweep`, `test.deterministic`, `replay` and `expect`, with the `keiko` CLI.
