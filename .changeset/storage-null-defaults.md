---
"@debuffjp/core": patch
---

`Storage` keeps any saved value for a field whose default is `null`, so `{ pick: null }` survives a reload. Before this, `fit` saw a kind mismatch between `null` and the saved value and quietly put the default back. The docs said this was fixed in 0.29.1, but the fix never shipped.
