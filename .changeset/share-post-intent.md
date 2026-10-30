---
"@debuffjp/share": minor
---

`postIntent({ text, url }, "x" | "bluesky")` returns a link that opens the X or Bluesky composer with a post drafted. Text is cut to fit with "…": 280 weighted characters on X (CJK and emoji count 2, a link 23) and 300 graphemes on Bluesky. Nothing is posted, and it's only there if you call it. `xWeight(text)` gives X's weighted length.
