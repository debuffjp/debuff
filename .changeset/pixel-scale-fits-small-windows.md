---
"@debuffjp/core": patch
---

`scale: "pixel"` now fits a container that is smaller than `width` by `height` even at one device pixel per unit: it scales down by a fraction, like `fit`, and keeps the minimum logical size. Before 0.29.2 the scale stopped at one device pixel, so with `pixelSize: 1` and a 1280 by 720 minimum a 1024 wide window showed a 1280 wide canvas and cut off the right edge. Containers that fit at one device pixel or more still scale by whole device pixels.
