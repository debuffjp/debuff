---
"@debuffjp/cli": patch
---

Warn when an asset PNG is wider or taller than 4096 pixels. A GPU with a smaller texture limit draws such an image black, so a long sprite strip like a 19800×80 grid now gets a warning from `debuff dev`, `debuff build` and `debuff assets` saying to split it. Before 0.29.3, the build said nothing.
