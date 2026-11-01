---
"spryte": minor
---

New `mesh(draw, frame, vertices, uvs, indices?, options?)`: draw an image stretched over triangles you place, for trails, ropes, waving flags and bent sprites. UVs are in source pixels from the frame's top-left, so atlas frames work. On WebGL2 meshes join the shape batch (one draw call with the shapes and sprites around them), and a two-triangle mesh over a frame matches `draw.sprite` pixel for pixel. Canvas 2D clips and draws each triangle, which is slower and can show faint lines along shared edges. It's a separate import: 1.6 kB brotli for apps that use it (0.1 kB if they already draw shapes), 0.08 kB for apps that don't.
