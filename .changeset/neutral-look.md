---
"@debuffjp/ui": minor
---

**The default look is now `neutral`.** Panels, menus and bars come in plain greys with a white focus, 4px corners and a thin border, so a game no longer looks like debuff unless it chooses to. squish, the old default, is a theme you opt into: spread `squish` into `drawPanel` or `panelAround`, and pass `squishBar` to `bar`, to keep the previous look. `neutralLight` suits light games. The focus pill's squash is now the `squash` option, on in `squish` and off by default. `debuffFrame` is deprecated in favour of `squish`.
