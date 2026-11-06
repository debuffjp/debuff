---
"@debuffjp/cli": patch
---

An asset or atlas cache entry left half-written (the process was killed mid-write) is treated as a cache miss and rebuilt. Before, a broken import entry made that asset warn and drop out on every run, and a broken atlas entry, or a missing atlas image, failed the whole compile, until someone deleted `.debuff/cache`.
