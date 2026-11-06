---
"spryte": patch
---

On WebGL2, an image drawn before it finished loading no longer keeps drawing as a white box once it loads. The renderer's one-entry texture cache remembered the white placeholder for the image, so its pixels were never uploaded until a rect, circle or text draw happened to reset the cache. Canvas 2D was not affected.
