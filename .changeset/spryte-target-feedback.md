---
"spryte": patch
---

A render target refilled with `draw.into()` after it was drawn stays filled. Its texture could still be bound to a texture unit from the earlier draw (or from its own creation), so the next draw into it was a feedback loop: WebGL rejected it and logged `GL_INVALID_OPERATION ... Feedback loop formed between Framebuffer and active Texture`, and the target stayed blank. Switching to a target now rebinds the 8 sprite units first. The same loop hit frames of shapes only under `blendSpace: "linear"`, whose sRGB framebuffer texture stayed bound after `end()` presented it; it no longer does. Reported in #118.
