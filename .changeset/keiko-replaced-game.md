---
"keiko": patch
---

Driving a game after a later `play()` replaced it, or after its test ended, now throws "This game was replaced by a later play()". Before, the old game kept working against a closed page: it stepped a clock nothing used, so `until` timed out with a misleading message, or it drove another game's dev hooks.
