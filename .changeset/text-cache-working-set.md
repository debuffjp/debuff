---
"spryte": patch
---

`draw.text`: the text cache no longer thrashes when a frame shows more than 256 distinct strings. It used to evict and re-rasterise strings still on screen every frame (155 ms a frame for 540 labels in 2dbench, 709 ms for 2,000). Now it never evicts a string drawn this frame or the last and grows to fit: 5.4 ms and 12.3 ms. Recovery after a lost WebGL context drops from 737 ms to 93 ms.
