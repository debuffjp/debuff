---
"@debuffjp/input": patch
---

Keyboard input works after clicking a game embedded in an iframe (game portals such as Wavedash). The pointer's `preventDefault` on `pointerdown` stopped the click focusing the frame, so keys went nowhere until the player clicked outside the game. A press now calls `window.focus()` when the document doesn't have focus.
