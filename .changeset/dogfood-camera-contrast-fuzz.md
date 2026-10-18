---
"@debuffjp/core": patch
"@debuffjp/cli": patch
---

- **Camera:** a followed sprite no longer shimmies a pixel while it moves. `Camera.view()` stops rounding its offset, and `Draw` snaps each sprite once, after the camera.
- **Scenario `contrast`:** samples one cell per logical pixel (up to 1024 a side) instead of averaging regions wider than 256 px, and compares the background with the text on it, so short labels in big boxes and 1-pixel pixel-font strokes are judged correctly.
- **`debuff fuzz`:** a loop now needs the scene, or two state fields, flipping together; a single counter rising and falling (bullets, particles) no longer counts. `--ignore <paths>` skips noisy fields.
