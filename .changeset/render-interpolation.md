---
"@debuffjp/core": patch
---

The camera now interpolates between simulation steps (`camera.renderAlpha`, set by `Game` before each render), so camera motion is smooth on displays faster than 60 Hz instead of jumping every few frames. The templates also interpolate their moving sprites using the `alpha` passed to `render`.
