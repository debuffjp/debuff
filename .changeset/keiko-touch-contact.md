---
"keiko": patch
---

The generic driver lets go of a touch `pointerDown` that `touchUp(1)` ended. Before, it still thought the contact was held, so later `pointerMove` calls went to the ended touch and never reached the game.
