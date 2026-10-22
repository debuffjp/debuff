---
"@debuffjp/assets": minor
---

New: `reload(id)` re-fetches an asset in place and `onChange(id, listener)` hears about it; `debuff dev` uses them when a level or data file changes on disk. One weakly held listener serves every loader, so loaders a game drops are collected. A reload that finishes before an earlier, slower fetch keeps its newer value, and every `onChange` listener runs even when one throws (the first error is reported after).
