---
"spryte": patch
---

`draw.sprite` is small enough again for V8 to inline into a game's loop. Its layer-recording and Canvas 2D paths now live in a separate method. When V8 can't inline a call, it boxes the call's number arguments on the heap, which meant garbage for every sprite. In 2dbench's bunny scene (200k sprites, RTX 5060 Laptop, Chrome), the median frame went from 15.3 ms to 14.7 ms over 5 interleaved rounds. The mixed scene didn't change.
