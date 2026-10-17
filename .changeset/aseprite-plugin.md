---
"@debuffjp/cli": minor
---

`aseprite()` tooling plugin: `.aseprite`/`.ase` files in `assets/` are exported by Aseprite automatically. Multi-frame files become sprite sheets (`assets.frames(id)`), `name@WxH.aseprite` flattens to a grid (for `BitmapFont`), hidden layers are skipped, and results are cached. Aseprite is found via `$ASEPRITE`, `PATH` or the usual install folders, including Steam; if it's missing, the build warns instead of failing.
