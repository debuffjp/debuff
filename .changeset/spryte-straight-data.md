---
"spryte": minor
---

`asData(image, { premultiply: false })` uploads an image with straight alpha, under either blend space, so data packed into RGBA (timings, indices) survives where alpha is below 255. Other images still upload premultiplied. It works for an `<img>`; a canvas already holds premultiplied pixels, and an `ImageBitmap` keeps the `premultiplyAlpha` it was made with. Reported in #112.
