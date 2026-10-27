---
"create-debuff": patch
---

New games keep the canvas hidden until debuff sizes it. Browsers first paint a 300x150 canvas, and its jump to full screen counted as a layout shift (CLS 0.2-0.4 on a desktop window; 0 now).
