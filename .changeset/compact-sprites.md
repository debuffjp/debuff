---
"spryte": patch
---

`draw.sprite()` is faster on WebGL2: the vertex shader now does each sprite's rotation, scale and anchor maths, which spryte used to do in JavaScript. In 2dbench's mixed scene (rotation, scale, tint and alpha on every sprite), a 50,000-sprite frame went from 7.1 ms to 5.5 ms on an RTX 5060 laptop, with the same pixels. Unrotated pixel art is still rounded to whole pixels on the CPU, so it lands where it did. Sprites and other drawing (rects, text, shapes) still share one batch. The Canvas 2D fallback is unchanged. Startup code is about 0.7 kB larger (brotli).
