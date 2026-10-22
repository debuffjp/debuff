# spryte: renderer audit and extraction plan

Date: 2026-10-19. Baseline commit: `aa9f80f`. Everything here was read from source or run; anything not run is marked **not verified**.

## 1. What exists

The renderer was already well separated. Before this change it lived in `packages/core/src/render/` (about 1,200 lines) and imported nothing outside that folder.

| File | Role |
| --- | --- |
| `backend.ts` | Internal `Backend` interface. Everything is a quad: a 2x3 matrix mapping the unit square, an optional source rect, RGBA tint, flash, filtering. Also `Matrix`, `BlendMode`, `ClipRect`, `RawContext`, `TextureSource`. |
| `webgl2.ts` | Instanced, multi-texture batcher. One static unit quad plus a 52-byte-per-instance buffer (16,384 instances), 8 texture units per batch, premultiplied alpha, `normal`/`add` blend, scissor clips, context loss/restore. |
| `canvas2d.ts` | Fallback. `setTransform` + `drawImage` per quad. Tint and flash go through a scratch canvas. Loaded with dynamic `import()` so WebGL2 browsers never download it. |
| `draw.ts` | Public `Draw`: transform stack (preallocated), `rect`, `circle` (64px cached disc), `line`, `sprite`, `text` (CSS fonts rasterised into an LRU cache of 256 canvases; bitmap fonts drawn per glyph), `measure`, `clip`, `withCamera`, `blend`, `invalidate`. Pixel-art snapping for unrotated sprites. |
| `color.ts` | `#hex`/number → `0xRRGGBBAA`, with a cached CSS fallback through a 1x1 canvas. |
| `bitmap-font.ts` | Sprite-sheet fonts. |
| `debuff-sans*.ts` | debuff's built-in pixel font, the default for `draw.text`. |

Renderer setup (`createBackend`, the `PENDING` placeholder) was in `core/src/game.ts`. `Game` also owns DPR, CSS scaling (`fit`/`integer`/`none`), `ResizeObserver`, DPR media-query tracking, and the frame lifecycle (`begin` / scene render / `reset` / hooks / `end`).

**Not present:** render targets, custom shaders or materials, masks beyond axis-aligned scissor clips, filters, blend modes other than normal/add, meshes or custom geometry, texture atlas packing (atlases are just frames in an image), GPU timing, mipmaps, and any WebGPU work.

**Tests:** `canvas2d.test.ts`, `draw.test.ts`, `bitmap-font.test.ts`, `debuff-sans.test.ts` run under happy-dom with recording fakes. **`webgl2.ts` has no unit tests.** It's excluded from coverage and exercised only by the templates' browser scenarios (`npm run test:scenarios`, screenshot baselines).

**Benchmarks:** `bench/renderer` is a bunnymark against PixiJS v8 `Sprite` and `ParticleContainer`. There is one result, from 2026-10-16 (Windows, Chrome, RTX 5060 Laptop). ADR 0007 has the numbers and caveats. It covers sprite throughput only, on one machine. I did not re-run it for this audit.

## 2. Boundary: what's in spryte, what stays in debuff

**In spryte:** `backend`, `webgl2`, `canvas2d`, `draw`, `color`, `bitmap-font`, plus a new `createRenderer()`.

**Stays in debuff:**
- debuff sans: the brand font. spryte's default font is now `draw.font` (default `"16px sans-serif"`), and `Game` sets it to `debuffSans`.
- `Camera`: it has game behaviour (shake through `Random`, interpolation with the fixed clock). spryte's `withCamera` already takes any `{ view(): Matrix }`.
- `Sprite`, animation, `Game`'s DPR/CSS scaling policy, the frame loop, splash, juice, tilemap, ui. These are framework concerns that draw through spryte.

**Dependencies to remove:** none in source. `import.meta.env` is only used by `Game`. The one coupling was the default font, which is now injectable.

## 3. Bugs, limitations, bottlenecks found while reading

Ordered by likely user impact. Items 1-3 are fixed (see "Status" after the list), with unit tests in `packages/spryte/test/webgl2.test.ts`.

1. **Precision risk on mobile.** The fragment shader is `precision mediump float`, so `v_uv` is mediump. On GPUs where mediump is real fp16 (many Mali and Adreno chips; desktop is always fp32), texel addressing in atlases wider than about 1-2k px can be off by a texel, which shows as bleeding and shimmer in pixel art. Fix: `highp` on the UV varying. Needs a device to confirm. **Not verified on hardware.**
2. **Switching filtering re-uploads the texture.** `texture()` keys its cache by source and deletes and re-uploads when `smooth` differs. Drawing one image both smooth and pixelated in the same frame re-uploads it on every switch. Fix: sampler objects (WebGL2 has them) or two cache entries.
3. **`dispose()` leaks GPU objects.** It deletes textures but not the program, shaders, VAO, quad/instance buffers or the white texture. It doesn't matter for one game per page, but it does for editors and hot reload that create and destroy renderers.
4. **Context restore doesn't restore clip state.** It's reapplied on the next `clip()` call, so this only matters mid-frame. Low risk.
5. **Every quad pays an 8-way sampler `if` chain** in the fragment shader. That's fine on desktop; on low-end mobile it's **not measured**.
6. **Text cache eviction** sorts the whole map (256 entries) on overflow. It's rare, so it's not a hot path.
7. **Canvas 2D fallback** is 20-40x slower (ADR 0007) and tint/flash cost two scratch-canvas compositions per quad. That's acceptable as a fallback.
8. **Upload stalls:** the first draw of a new image uploads synchronously in the frame. There's no preload/upload API, so a level start can hitch.

**Status (2026-10-19):** fixed 1 (UVs are `highp`; still **not verified on a phone**), fixed 2 (sampler objects: one upload per source, filtering chosen per draw), and fixed 3 (`dispose` deletes the program, buffers, VAO, samplers and white texture; shaders are deleted after linking). The WebGL2 backend now has unit tests against a recording fake GL, covering batching, the 8-unit split, context loss and restore, `invalidate`, scissor and `dispose`. The basic template's startup code went from 14.7 to 14.9 kB brotli.

## 4. Must not regress

The draw order and output of `rect/circle/line/sprite/text/clip/blend/withCamera`, pixel-art snapping, premultiplied tint and flash, the lazy Canvas 2D fallback chunk, context-loss handling, `draw.raw`, `drawCalls`/`quads` diagnostics, every name `@debuffjp/core` exports, and the scenario screenshot baselines for basic, platformer, mossfell and squish.

## 5. Extraction risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Two diverging copies | The files were moved with `git mv`, not copied. Core has no renderer source left, only re-exports. |
| Breaking games' imports | Core re-exports the same names and types, so no game code changes. |
| Bundle size grows from the package split | Same modules, `sideEffects: false`, so tree-shaking is unchanged. Template brotli size is reported from `npm run check`. |
| Core's "no dependencies" claim | Core now depends on `spryte`, pinned to an exact version (0.1.0). spryte versions independently of debuff's fixed `@debuffjp/*` group. Core's README needs updating. |
| Name collision | The working name "Sprig" clashed with Hack Club Sprig (npm `sprig`). **Decided 2026-10-19: spryte**, unscoped `spryte` (free on npm at that date, not yet claimed). |
| Losing history when moving to its own repo | Use `git subtree split --prefix packages/spryte` (or `git filter-repo`). The `git mv` keeps the files' history followable. |

## 6. Package and API

One package for now. Splitting into `renderer-webgl` and `renderer-canvas` buys nothing yet: the Canvas 2D backend is already a separate lazy chunk.

```ts
createRenderer(canvas, { backend?: "auto" | "webgl2" | "2d", smooth?: boolean }): Draw
Draw: begin/end/resize/dispose, push/pop/translate/scale/rotate, rect/circle/line/sprite/text/measure,
      clip, withCamera, blend, invalidate, alpha, smooth, font, kind, raw, quads, drawCalls
BitmapFont, toRGBA, rgbaToCss, and the types Frame, Matrix, Color, BlendMode, ClipRect, RawContext, TextureSource
```

API debt to settle before 1.0: `begin`, `end`, `resize`, `dispose` and `renderScale` are marked `@internal` but standalone users need them. They should be documented as public. `renderScale` should be read-only.

## 7. Web compatibility matrix (initial)

| Environment | WebGL2 path | Canvas 2D fallback | Evidence |
| --- | --- | --- | --- |
| Chrome/Edge, Windows (ANGLE D3D11) | expected | expected | Scenarios run in Chromium during `npm run check`; ADR 0007 bench |
| Firefox desktop | expected | expected | **not tested** |
| Safari macOS 15+ | expected (WebGL2 since 15) | expected | **not tested** |
| Safari iOS/iPadOS 15+ | expected | expected | **not tested on device**; see mediump risk |
| Chrome Android | expected | expected | **not tested on device**; see mediump risk |
| ChromeOS | expected | expected | **not tested** |
| WebViews (WKWebView, Android WebView) | expected | expected | **not tested** |

"Expected" means the APIs used are in each engine's WebGL2 baseline. It is not a claim of support.

## 8. Plan, by priority

1. **Done in this change:** a `packages/spryte` workspace package as the canonical source, `createRenderer`, an injectable default font, core re-exports, tests moved, a standalone example, and a README.
2. Decide the name and repo (see section 5), then `git subtree split` into its own repo with CI, and have debuff pin the published version.
3. ~~Correctness fixes~~ done. Next: verify `highp` on real iOS and Android devices.
4. ~~WebGL2 unit coverage~~ done with a fake GL. Still to do: a pixel-level browser test inside spryte itself, so it doesn't depend on debuff's game scenarios.
5. ~~A spryte entry and a mixed scene in the PixiJS benchmark~~ done (see `packages/spryte/docs/benchmarks.md`). Still to do: a benchmark suite beyond these two scenes (tilemap world, particles, text-heavy UI, create/destroy churn), run on at least one iPhone and one mid-range Android, with the methodology published.
6. Public lifecycle API cleanup (section 6), then API docs.
7. Render targets and a minimal custom-shader hook, only once a real game needs them.

### Progress since the audit (2026-10-19)

- **Differentiation against PixiJS, measured** (`packages/spryte/docs/benchmarks.md`; one machine, so the caveats apply):
  - `draw.sprites()` bulk path: about 3x ParticleContainer at 200k.
  - With per-copy scale, rotation and colour: about 4x ParticleContainer with every dynamic property on.
  - A `sprite()` loop is about 4x PixiJS `Sprite`.
  - About 9x less JS at startup (10.1 vs 87.8 kB brotli, `bench/size`).
- **New features:**
  - Render targets (`createTarget`, `into`).
  - Custom shaders (`createShader`, `withShader`, with errors mapped to your line numbers).
  - `draw.ready`, `draw.contextLost`, and per-copy `sprites()` values.
- **Verification:** 19 real-GPU pixel checks (`npm run test:browser`) run inside `npm run check`. Each new check was confirmed to fail on a deliberately broken implementation.
- **Standalone repo:** private `debuffjp/spryte`, kept current with `git subtree split`. Nothing is published yet.

## 9. Release readiness

Not ready for a 1.0. A public beta is now justified on features and performance, but still has no device matrix. The code is production-proven inside debuff, but it has no WebGL2 unit tests, no device matrix, one benchmark machine, an unsettled name, and lifecycle methods still marked internal. A public beta is reasonable after plan steps 2-4.

## 10. Open decisions (need the maintainer)

- Claim the `spryte` npm name (publish a placeholder or the first beta) before someone else does.
- Repo home (`debuffjp/spryte`?).
- Whether debuff sans should ship with spryte as an optional export. It's MIT and pixel-art friendly, but it's the brand font.
