---
"spryte": minor
---

spryte inside another engine. `createSharedRenderer(gl)` draws on a WebGL2 context the host owns, inside its frame and draw order: into the host's framebuffer, under its scissor and stencil, leaving its texture filtering alone. `spryte/phaser` wraps it for Phaser 4: `spryteExtern(extern, render)` draws in an `Extern`'s slot with Phaser's camera applied, and `createPhaserContext()` gives Phaser a WebGL2 context with its shaders translated to GLSL ES 3.00 (Phaser 4.2.1's `Gradient`, noise normal maps and `smoothPixelArt` don't compile on WebGL2 otherwise). Also `draw.transform(a, b, c, d, e, f)` multiplies a matrix onto the transform, and `draw.begin(null, ...)` draws over the previous frame instead of clearing.
