# debuff sans

The pixel font built into [debuff](https://debuff.jp). Printable ASCII plus `· × … ° ← ↑ → ↓ ♥ ★`, 5×7 capitals with 2-pixel
descenders, proportional widths, white glyphs so any engine can tint them.

- `debuff-sans.png`: a 6×9 grid in ASCII order (space to `~`), then the extras above. Each glyph starts at its cell's left edge;
  its advance is its rightmost inked column + 1, with 1 pixel of spacing and a 3-pixel space.
- `build.mjs`: the source of truth. Edit the glyph table, run `node fonts/debuff-sans/build.mjs`, and it
  regenerates the PNG and the data built into `@debuffjp/core`.

In debuff it's the default for `draw.text`, and `debuffSans()` returns it as a `BitmapFont`.

License: MIT, like the rest of debuff.
