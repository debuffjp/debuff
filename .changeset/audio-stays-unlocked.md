---
"@debuffjp/audio": patch
---

Audio resumes on the next tap or key after the browser suspends it again, such as an iOS phone call or app switch. Before, the unlock listeners were removed after the second gesture and audio stayed silent.

`audio.stream()` keeps one state (playing, paused or stopped). `stop()` is final: `resume()` after it does nothing, where before it restarted a track that the fade-out was about to unload. A blocked track waits for the context unlocking or the next pointer or key gesture, so music also starts where the context was already running but the element was blocked. Pausing and resuming a blocked track no longer piles up retry listeners.
