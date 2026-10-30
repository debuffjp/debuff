---
"@debuffjp/cli": patch
"@debuffjp/mcp": patch
---

`debuff papercut --hit <id> --workaround "…"` and `report_papercut` with `hit` send the workaround, which fills the papercut's workaround when it has none. Before, it was dropped. `--hit` says which other flags it ignores, and links point at `papercuts.debuff.jp/<id>`.
