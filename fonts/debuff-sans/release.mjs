// Font files for apps outside debuff, from the glyphs in glyphs.mjs:
//   fonts/debuff-sans/dist/debuff-sans.ttf  outline font, one 100-unit square per pixel (crisp at 10, 20, 30px…)
//   fonts/debuff-sans/dist/debuff-sans.bdf  bitmap font, for editors and engines that read BDF
//   fonts/debuff-sans/specimen.png          every glyph, for the README (committed)
// Run `node fonts/debuff-sans/release.mjs`. dist/ is generated and not committed.

import { mkdirSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";
import { advanceOf, H, ORDER, rowsOf } from "./glyphs.mjs";
import { png } from "./png.mjs";

const VERSION = "1.000";
const UNIT = 100; // font units per pixel
const BASELINE = 7; // rows above the baseline
const SPACING = 1; // pixels after each glyph
const SPACE = 3; // advance of an empty glyph
const dist = new URL("./dist/", import.meta.url);
mkdirSync(dist, { recursive: true });

// ---- TTF ----------------------------------------------------------------------------------------
// Each row's runs of ink become one rectangle, so outlines never overlap.
function outline(rows) {
  const path = new opentype.Path();
  rows.forEach((row, y) => {
    const top = (BASELINE - y) * UNIT;
    const bottom = top - UNIT;
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#") continue;
      let end = x;
      while (row[end + 1] === "#") end++;
      // Clockwise in a y-up space, as TrueType expects for filled contours.
      path.moveTo(x * UNIT, bottom);
      path.lineTo(x * UNIT, top);
      path.lineTo((end + 1) * UNIT, top);
      path.lineTo((end + 1) * UNIT, bottom);
      path.close();
      x = end;
    }
  });
  return path;
}

const advanceWidth = (ch) => ((advanceOf(ch) || SPACE) + SPACING) * UNIT;
const glyphs = [
  new opentype.Glyph({ name: ".notdef", advanceWidth: 6 * UNIT, path: outline(rowsOf("?")) }),
  ...ORDER.map(
    (ch) =>
      new opentype.Glyph({
        name: ch === " " ? "space" : `uni${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
        unicode: ch.codePointAt(0),
        advanceWidth: advanceWidth(ch),
        path: outline(rowsOf(ch)),
      }),
  ),
];

const font = new opentype.Font({
  familyName: "debuff sans",
  styleName: "Regular",
  unitsPerEm: 10 * UNIT,
  ascender: (BASELINE + 1) * UNIT,
  descender: -(H - BASELINE) * UNIT,
  designer: "debuff",
  designerURL: "https://debuff.jp",
  manufacturer: "debuff",
  manufacturerURL: "https://debuff.jp",
  version: VERSION,
  copyright: "Copyright 2026 The debuff sans Project Authors (https://github.com/debuffjp/debuff-sans)",
  license: "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
  licenseURL: "https://openfontlicense.org",
  createdTimestamp: Date.UTC(2026, 9, 18) / 1000,
  glyphs,
});
writeFileSync(new URL("debuff-sans.ttf", dist), Buffer.from(font.toArrayBuffer()));

// ---- BDF ----------------------------------------------------------------------------------------
const hex = (row, width) => {
  let bits = 0;
  for (let x = 0; x < 8; x++) if (row[x] === "#") bits |= 128 >> x;
  return bits.toString(16).toUpperCase().padStart(2, "0") + (width > 8 ? "00" : "");
};
const bdf = [
  "STARTFONT 2.1",
  "FONT -debuff-debuff sans-Medium-R-Normal--9-90-75-75-P-50-ISO10646-1",
  "SIZE 9 75 75",
  `FONTBOUNDINGBOX 5 ${H} 0 ${BASELINE - H}`,
  "STARTPROPERTIES 8",
  'FOUNDRY "debuff"',
  'FAMILY_NAME "debuff sans"',
  'WEIGHT_NAME "Medium"',
  'COPYRIGHT "debuff (https://debuff.jp)"',
  `FONT_ASCENT ${BASELINE + 1}`,
  `FONT_DESCENT ${H - BASELINE}`,
  "DEFAULT_CHAR 63",
  `FONT_VERSION "${VERSION}"`,
  "ENDPROPERTIES",
  `CHARS ${ORDER.length}`,
];
for (const ch of ORDER) {
  const code = ch.codePointAt(0);
  const dw = (advanceOf(ch) || SPACE) + SPACING;
  bdf.push(
    `STARTCHAR ${ch === " " ? "space" : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`}`,
    `ENCODING ${code}`,
    `SWIDTH ${dw * 111} 0`,
    `DWIDTH ${dw} 0`,
    `BBX 5 ${H} 0 ${BASELINE - H}`,
    "BITMAP",
    ...rowsOf(ch).map((row) => hex(row, 5)),
    "ENDCHAR",
  );
}
bdf.push("ENDFONT", "");
writeFileSync(new URL("debuff-sans.bdf", dist), bdf.join("\n"));

// ---- specimen -----------------------------------------------------------------------------------
// Drawn straight from the bitmaps at 4x, in debuff's colours.
const LINES = [
  ["debuff sans", 0xcffb2dff, 2],
  ["a pixel font for 2D web games", 0x7a8a5aff, 1],
  ["", 0, 1],
  ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0xe7fd96ff, 1],
  ["abcdefghijklmnopqrstuvwxyz", 0xe7fd96ff, 1],
  ["0123456789 !\"#$%&'()*+,-./:;<=>?@", 0xe7fd96ff, 1],
  ["[\\]^_`{|}~ ·×…°←↑→↓♥★", 0xe7fd96ff, 1],
  ["", 0, 1],
  ["press space → overbuffed! ♥♥♥ 0:42", 0xcffb2dff, 1],
];
const PAD = 6;
const width = (text) => [...text].reduce((w, ch) => w + (advanceOf(ch) || SPACE) + SPACING, 0);
const canvasW = PAD * 2 + Math.max(...LINES.map(([text, , size]) => width(text) * size));
const canvasH = PAD * 2 + LINES.reduce((h, [, , size]) => h + (H + 2) * size, 0);
const pixels = new Uint32Array(canvasW * canvasH).fill(0x11140dff);
let top = PAD;
for (const [text, color, size] of LINES) {
  let left = PAD;
  for (const ch of text) {
    rowsOf(ch).forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] === "#")
          for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++) pixels[(top + y * size + dy) * canvasW + left + x * size + dx] = color;
    });
    left += ((advanceOf(ch) || SPACE) + SPACING) * size;
  }
  top += (H + 2) * size;
}
const SCALE = 4;
writeFileSync(
  new URL("./specimen.png", import.meta.url),
  png(canvasW * SCALE, canvasH * SCALE, (x, y) => pixels[Math.floor(y / SCALE) * canvasW + Math.floor(x / SCALE)]),
);

console.log(`debuff sans ${VERSION}: ${ORDER.length} glyphs → dist/debuff-sans.ttf, dist/debuff-sans.bdf, specimen.png`);
