---
"@debuffjp/core": patch
---

A `gameEvent` listener that throws no longer hides the event from the listeners after it or drops the events queued behind it. Every listener hears every event, then `game.emit` rethrows the first error.
