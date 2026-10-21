---
"spryte": patch
---

`blur()` takes half the texture samples (two texels per tap through linear filtering) and reaches twice as far: blurs up to about 40 device pixels now match CSS `blur()`, instead of being cut short past 20.
