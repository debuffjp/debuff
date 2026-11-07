---
"spryte": patch
---

The shader docs (JSDoc on `Shader` and `withShader`, `docs/api.md`) now say what custom shaders do with shapes. `rect()`, `line()` and `circle()` run the effect, with `frameUv()` from (0, 0) to (1, 1) across each, so a full-screen vignette can be a `rect()` over the view with no render target. The vector shapes (`polygon`, `polyline`, `roundRect`, `ring`) and `mesh` draw without the effect. Up to 0.12.3 the docs said shapes get (0, 0), which was wrong for both. They also note that `uv.y` runs bottom to top on a render target, where `frameUv()` runs top to bottom. Behaviour is unchanged.
