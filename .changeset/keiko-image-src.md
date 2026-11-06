---
"keiko": patch
---

A headless image whose `src` changes before the first load finishes only reports the latest one, as browsers do. Before, the earlier load could still set its size and fire `load` or `error`. An `XMLHttpRequest.send()` that throws straight away no longer leaves the page waiting for a load that never comes.
