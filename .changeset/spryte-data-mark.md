---
"spryte": patch
---

`isData` also accepts images tagged with `Symbol.for("spryte.data")`, so a library such as shodo can mark its MSDF atlases as data under `blendSpace: "linear"` without importing spryte. The tag also works when a bundle holds two copies of spryte.
