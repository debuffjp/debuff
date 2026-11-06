---
"spryte": patch
---

A renderer disposed before its Canvas 2D fallback finished loading stays disposed. Before, the fallback replaced the disposed stand-in when it arrived, so the renderer drew again despite "using this Draw afterwards throws".
