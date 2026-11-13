---
"spryte": minor
---

`source()` in custom shaders picks the batch's texture with a `switch` instead of a chain of eight `if`s. A 16-tap effect over eight textures took about 35% less frame time on an RTX 5060 (7.1 ms to 4.6 ms median for 32 full-HD layers), with the same pixels. One-tap effects, including spryte's default program, showed no measurable change. Reported in #111.
