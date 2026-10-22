# @debuffjp/ui

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

## 0.9.3

No changes in this release.

## 0.9.2

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

### Minor Changes

- d159eef: The "squish" look everywhere:
  
  - **ui:** panels and menus that set no frame of their own get round corners, no outline, light labels, lime focus and a jelly highlight that squashes when focus moves (`debuffFrame` is this look; `FrameStyle.radius` is new). Styles that set their own borders or fill are untouched.
  - **dev panel:** soft rounded panel, pill buttons and tabs, controls that squash on press, round toggles and sliders.
  - **CLI:** buff is flat with dot eyes, and squashes when a command succeeds.
  - **basic template:** buff is a flat jelly block with pill eyes, little feet, an idle jiggle and a hop on pop.

## 0.8.0

No changes in this release.

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
