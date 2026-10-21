---
"spryte": minor
---

Vector shapes: `polygon` (concave is fine), `polyline` (strokes with mitred joins), `roundRect` (filled or outlined) and `ring`. On WebGL2 they're tessellated on the CPU and antialiased with a one-pixel feathered edge, so they match Canvas 2D's antialiasing without MSAA, and they batch in draw order with sprites. Custom shaders (`withShader`) don't apply to shapes.
