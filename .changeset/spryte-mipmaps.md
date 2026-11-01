---
"spryte": minor
---

New `mipmaps` option for `createRenderer`: build mip levels for every uploaded image, so smooth images drawn well below their size (zoomed-out maps, charts, thumbnails) stay steady instead of shimmering. Off by default; costs a third more GPU memory per image. Render targets, borrowed host textures and `smooth: false` draws are unaffected.
