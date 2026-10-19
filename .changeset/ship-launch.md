---
"@debuffjp/cli": minor
---

`debuff build` now adds link-preview tags (Open Graph and Twitter), a web app manifest and a preview image (your first scenario baseline) to `dist/`, configured by `launch` in `debuff.config.ts`. New `debuff ship itch|wavedash|press` gets a build ready for a store: an itch.io zip with limit checks, Wavedash config and `Wavedash.init()` checks, or a press kit with a factsheet and screenshots. It never uploads anything.
