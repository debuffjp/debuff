---
"@debuffjp/dev": patch
---

The `luminance` dev hook, which the `flashes` and `contrast` scenario checks read, now averages every pixel in each cell itself. It used to shrink the frame with `drawImage`, which point-samples on macOS, so fine detail scrolling past (the topdown template's grass) failed the flash check there and nowhere else.
