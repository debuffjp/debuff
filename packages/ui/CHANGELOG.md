# @debuffjp/ui

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- a872480: Frames can have chamfered pixel corners (`chamfer`) and a hard drop shadow (`shadow`, `shadowOffset`), and `bar()` draws a segmented meter that lights whole, equal cells. `debuffFrame` is debuff's own panel look, to spread into any frame or menu panel style. The defaults are unchanged.

## 0.6.0

### Minor Changes

- 22157f7: `draw.text` and menus now default to **debuff sans**, a built-in pixel font (printable ASCII, 5x7 capitals, proportional), instead of the browser's `8px monospace`. `debuffSans()` returns it as a `BitmapFont`. Pass `font: "8px monospace"` to keep the old look.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 1f5fb28: `BitmapFont`: pixel fonts from a sprite-sheet grid, with widths measured from the glyph pixels. Pass one as `font` to `draw.text`, `draw.measure` and `@debuffjp/ui` menus. The CLI ships `aseprite/new-font.lua`, which creates a blank font sheet with the grid set up.
- 134c84a: `draw.measure(text, font)` returns the box `draw.text` fills. `@debuffjp/ui` now lays menus out from measured text: a fixed cursor column, right-aligned value rows with left/right changes, `drawPanel` (a titled, centred, evenly padded frame), `panelAround`, and positions snapped to whole pixels. The platformer's pause menu gains a settings screen with a saved volume.
- 8529aa9: Menus respond to taps and clicks: a tap selects the row under it, and on a value row the left half lowers the value and the right half raises it. Pass an `Input` (or anything with `pointer`) to `update`.

## 0.2.0

### Minor Changes

- 95cfe26: New `@debuffjp/ui` package: `Transition` (fade out, swap, fade in), `Menu` (keyboard, gamepad and touch navigation through input actions) and `panel` (framed boxes). No dependencies. The dev overlay now attributes errors in it to debuff.
