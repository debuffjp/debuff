---
"spryte": minor
---

`parseKtx2(bytes)` reads a KTX2 file of BC7, ETC2 or ASTC 4x4 blocks into a `CompressedTexture`, which `draw.sprite` and the other image draws take like any image. It stays compressed in video memory, at 1 byte per pixel instead of 4. `draw.compressedFormats` lists the families the GPU decodes, so a game can pick which file to load. WebGL2 only: the Canvas 2D fallback skips compressed textures with one warning. Supercompressed files (Basis, zstd) aren't supported. Part of #120.
