---
"@debuffjp/cli": minor
"@debuffjp/assets": minor
"@debuffjp/core": minor
---

`assets.compress` in debuff.config writes GPU-compressed KTX2 copies of every PNG, atlases included: BC7 for desktop, ASTC 4x4 and ETC2 for phones, each a quarter of the PNG's video memory. The build encodes each image once with Basis Universal (through `ktx2-encoder`) and transcodes it to each format, with mip levels and premultiplied colour. Manifest entries list the copies under `compressed`. `new Assets(manifest, base, { compressed: { formats: game.draw.compressedFormats, parse: parseKtx2 } })` loads the copy the GPU decodes and falls back to the PNG; `frame()` returns it, so `draw.sprite` takes it unchanged. Images with copies are no longer preloaded from `index.html`. `@debuffjp/core` re-exports `parseKtx2`, `CompressedTexture` and `CompressedFormat`. `ImageFrame.image` can now be a compressed image, so code that reads `naturalWidth` from it should read `width`. Closes #120.
