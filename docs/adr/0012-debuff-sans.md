# ADR 0012: debuff sans is the default font

- Status: accepted
- Date: 2026-10-18
- Related: ADR 0008 (UI package, pixel fonts in core)

## Context

`draw.text` defaulted to `"8px monospace"`, rasterised by the browser. In a pixel-art game that text is
smooth, blurry at integer scales, and looks different on every OS. Every example game (platformer, mossfell,
Overbuffed) either lived with it or drew its own font. Logic tests and scenarios also depended on the
machine's fonts.

## Decision

debuff ships a bespoke pixel font, **debuff sans**, in `@debuffjp/core`, and `draw.text` / `draw.measure`
(and `@debuffjp/ui` menus) use it when no `font` is given. CSS fonts and custom `BitmapFont`s still work.

- The glyphs are printable ASCII plus `· × … ° ← ↑ → ↓ ♥ ★`, up to 5x9 pixels (5x7 capitals, 2-pixel descenders), proportional.
- The source of truth is the readable glyph table in `fonts/debuff-sans/build.mjs`. It generates the packed
  data in core (one base-32 digit per row, ~1 kB) and a PNG sheet for other engines. `lint:packages`
  fails if they are stale.
- The texture is built on first use, so games that never draw text pay only for the code, not the canvas.

This reverses the size argument in ADR 0008 point 3: `Draw` now imports `BitmapFont` at runtime, so every
game that uses `Draw` bundles the font (~1.3 kB brotli). We accept that for consistent, crisp text everywhere.

## Consequences

- New games get pixel text with no setup, the same on every machine and in headless tests.
- Games that relied on the implicit monospace default change appearance; passing `font: "8px monospace"`
  restores it.
- The font is also released on its own under the SIL OFL 1.1 (`fonts/debuff-sans`, TTF/BDF/PNG from `release.mjs`).
