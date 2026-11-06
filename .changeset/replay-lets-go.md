---
"@debuffjp/dev": patch
---

A rewind or state-preserving reload whose replay fails no longer leaves the game stuck. Held keys, the pointer and touches are let go and real gamepads take over again, even when a step throws. The session pauses where the replay stopped and logs why ("replay failed") instead of throwing out of the dev tools' install. A recorded param change that the new code renamed or narrowed is skipped with a warning, and the rest of the replay carries on.
