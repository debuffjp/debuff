---
"@debuffjp/core": patch
---

`game.go()` called from a scene's `enter` or `exit`, or from a `sceneChange` listener, now runs after the current switch finishes. A scene that redirects in `enter` (a boot scene going straight to the menu) gives `sceneChange` in order (`a > boot`, then `boot > menu`) instead of reversed, and a `go()` in `exit` no longer recurses until the stack overflows.
