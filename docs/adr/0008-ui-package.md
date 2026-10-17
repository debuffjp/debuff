# ADR 0008: Batteries-included UI as its own package

- Status: accepted
- Date: 2026-10-17
- Related: ADR 0002 (repo layout), ADR 0004 (plugin API)

## Context

Every game made with debuff ends up building the same screens around its gameplay: a fade between areas, a title or pause menu, a settings screen, a framed panel. The templates showed it: mossfell hand-rolled a stairs fade and a title frame from stacked rectangles. Hand-rolled layouts also drifted out of alignment, because `draw.text` couldn't report how big text was.

## Decision

1. **A new `@debuffjp/ui` package** holds `Transition`, `Menu`, `panel` and `panelAround`. It isn't part of core, so the starter template's size doesn't change. Like `@debuffjp/juice`, it has **no dependencies**: it talks to `draw` and `input` through small structural interfaces (`DrawLike`, `InputLike`), so it works with test doubles and can be used piece by piece.
2. **Layout is measured, not guessed.** Core gains `draw.measure(text, font)`. Menus give the cursor its own column, right-align values, centre framed menus on a point with even padding, and snap every position to whole pixels. This is the default; callers don't have to pad by hand.
3. **Pixel fonts live in core** (`BitmapFont`), because `draw.text` has to understand them. `Draw` imports the class as a type only, so games that never use a bitmap font don't bundle it.
4. **Everything runs on `update(dt)` and input actions.** Fades, menus and taps advance only through the fixed step and the input system, so replays and scenarios stay deterministic.
5. **Asset authoring stays in tooling.** `.aseprite` support is the first-party `aseprite()` CLI plugin from ADR 0004, not a runtime feature.

## Rejected

- **Pausing when the window loses focus.** That would change game state from a DOM event outside the input system and break deterministic replays. Core already pauses while the tab is hidden.
- **A retained widget tree or a CSS-like layout engine.** It's far larger than what games need, and immediate-mode `draw` calls already fit how debuff renders.
- **Default art direction.** The defaults are plain greys, and colours, fonts and placement belong to each game.

## Consequences

- One more package to publish and version.
- `Menu` stores the row boxes from its last `draw` so taps can hit them. A menu has to be drawn once before it accepts taps.
- The Canvas 2D fallback needed real texture tinting (multiply on a scratch canvas) so coloured text and fonts match WebGL2. It costs a little extra, and only for tinted draws.
