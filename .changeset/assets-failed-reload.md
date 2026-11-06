---
"@debuffjp/assets": patch
---

An asset whose `reload()` fails while its first fetch is still on the way is now cached when that fetch arrives. Before, `load()` resolved but `get()` threw "not loaded yet" until the next successful reload.
