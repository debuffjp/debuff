---
"@debuffjp/core": minor
"@debuffjp/ui": minor
---

`draw.text` and menus now default to **debuff sans**, a built-in pixel font (printable ASCII, 5x7 capitals, proportional), instead of the browser's `8px monospace`. `debuffSans()` returns it as a `BitmapFont`. Pass `font: "8px monospace"` to keep the old look.
