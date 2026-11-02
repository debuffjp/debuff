---
"@debuffjp/core": minor
---

`Storage.set` and `reset` return whether the write reached storage, and dev builds warn when it fails. Before, a save over the localStorage quota failed silently and a reload got the last save that fitted.
