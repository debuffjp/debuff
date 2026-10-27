---
"spryte": minor
---

`spryte/pixi`: draw with spryte inside a PixiJS v8 app through a `RenderContainer`, in Pixi's scene order, under its masks, filters and render textures, on Pixi's own WebGL2 context. Images Pixi has uploaded draw from Pixi's GPU textures and stay marked as used for Pixi's texture GC. Borrowed textures are now looked up again every frame, so a host that frees or re-creates one is never drawn stale.
