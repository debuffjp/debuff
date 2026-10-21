---
"spryte": minor
---

Vector shapes: `draw.polygon` (concave is fine), `draw.polyline` (strokes with mitred joins), `draw.roundRect` (filled or outlined) and `draw.ring`. On WebGL2 they're tessellated on the CPU and antialiased with a one-pixel feathered edge, so they match Canvas 2D's antialiasing without MSAA, and they batch in draw order with sprites. Custom shaders (`withShader`) don't apply to shapes.
