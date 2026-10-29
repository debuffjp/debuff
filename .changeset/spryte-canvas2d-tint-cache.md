---
"spryte": patch
---

Canvas 2D fallback: tinted sprites in more than 256 colours no longer slow to seconds per frame. The cache of recoloured copies used to clear completely at 256 entries, so animated or per-copy colours re-tinted nearly every sprite every frame; it now drops the least recently used entry and holds up to 1,024 per image. Repeating the last tint also skips the cache lookup. Output is unchanged. Measured in headless Chrome: 6,000 copies in 1,000 colours went from 2.2 s to 36 ms per frame, and 60,000 copies in one colour from 212 to about 180 ms.
