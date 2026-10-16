---
"@debuffjp/core": patch
---

Pixel-art games (`pixelArt: true`) now draw unrotated sprites on whole pixels. Nearest sampling at fractional positions made sprite edges gain and lose a pixel from frame to frame, which read as flicker on bobbing pickups, particles and eased movement.
