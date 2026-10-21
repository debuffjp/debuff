---
"spryte": patch
---

Shapes batch faster: indexed geometry and a fan for convex shapes (5,000 round rects: 39 ms to 17 ms on an AMD 780M laptop), and sprites drawn between shapes join the shape batch, so UI that alternates panels and icons is one draw call instead of one per switch (5,000 pairs: 50 ms to 18 ms).
