---
"spryte": patch
---

`draw.sprite()` is faster again on WebGL2: a sprite drawn under the same transform as the one before it now skips straight to writing its instance, instead of re-checking the transform, the texture and the batch. On 2dbench (RTX 5060 laptop, Chrome 155), the mixed scene at 50,000 sprites went from 5.8-6.0 ms to 4.1-5.0 ms and bunny from 5.2-6.0 ms to 4.1-4.7 ms, over two interleaved passes, with the same pixels. Scenes that don't use `draw.sprite` per sprite don't change. Startup JS grows by about 0.1 kB (brotli).
