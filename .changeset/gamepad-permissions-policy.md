---
"@debuffjp/input": patch
---

Gamepad polling no longer crashes a game embedded in a frame whose permissions policy blocks the Gamepad API (chat app sandboxes, some embeds): `getGamepads()` throwing now counts as no pad.
