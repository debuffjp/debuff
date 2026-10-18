---
"@debuffjp/core": patch
"@debuffjp/cli": patch
---

Smaller startup: the splash and the Canvas 2D fallback load on demand, so WebGL2 browsers never download the fallback and games without the splash never download it. The starter's startup code drops from 14.1 to 13.3 kB brotli. `debuff build` reports code at startup separately from code loaded on demand.
