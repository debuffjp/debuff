# ADR 0013: The renderer is spryte, a standalone package, and claims are benchmarked fairly

- Status: accepted
- Date: 2026-10-19
- Amends: ADR 0007 (WebGL2 renderer; its numbers are superseded)

## Context

The WebGL2 renderer from ADR 0007 lived in `@debuffjp/core/src/render` and imported nothing outside that folder. A renderer that other engines, editors and plain apps can use widens debuff's reach ("empowering best-in-class 2D web games"). An audit (`docs/spryte/audit.md`) found it extractable with no dependency changes, apart from the default font.

ADR 0007's comparison with PixiJS was one non-interleaved run per renderer. PixiJS's `ParticleContainer` was faster per frame than debuff at high counts, and the method had no check that every renderer drew the same thing.

## Decision

1. **The renderer is [spryte](../../packages/spryte), published unscoped as `spryte`, MIT.** `packages/spryte` is the canonical source. It's mirrored to `github.com/debuffjp/spryte` with `git subtree split`. Code changes land in debuff so the games here keep testing them. `@debuffjp/core` depends on an exact spryte version and re-exports its API, so game code doesn't change. debuff sans stays in core and is injected as `draw.font`.
2. **spryte stays a renderer:** drawing, textures, render targets, shaders, lifecycle. Loops, input, audio, cameras with game behaviour, and DPR/CSS scaling policy stay in debuff.
3. **Bulk drawing is part of the API.** `draw.sprites(frame, positions, count, options, each?)` uploads typed arrays as is: 8 bytes per copy for positions, plus optional per-copy scale, rotation and packed colour. That removes per-sprite JavaScript, which a Chrome CPU profile at 200k sprites showed was where the time went (`Draw.sprite` and `WebGL2Backend.quad` together were about half the frame, against similar GPU time). The profile wasn't committed; rerun it with DevTools on `bench/renderer`.
4. **Every performance claim comes from `npm run bench:renderer`**, which:
   - runs several **interleaved rounds** in rotating order and reports the median with min–max;
   - checks **pixel parity** first: every renderer draws the same seeded frame, and coverage (drawn area relative to the reference) has to show nobody skips work;
   - records the **environment**: GPU, Chrome, CPU, OS, the detected power source and plan, the PixiJS version, and the spryte version and commit;
   - compares **like for like**: `draw.sprite` against PixiJS `Sprite`, and `draw.sprites` against `ParticleContainer` with the same dynamic properties. Both renderers use nearest filtering, no antialiasing and whole-pixel rounding (PixiJS with `roundPixels: true`).
5. **Correctness is checked on a real GPU.** `packages/spryte/browser-test` proves the bulk paths, render targets and shaders draw the same pixels as the simple path. It runs in `npm run check`.

## Consequences

- Results and their caveats live in [`packages/spryte/docs/benchmarks.md`](../../packages/spryte/docs/benchmarks.md). The site, READMEs and blog posts quote that page and link to it.
- Numbers from one machine are labelled as such. Results from phones and other browsers are wanted, and the bench records enough to compare them.
- Old numbers (ADR 0007, 2026-10-16) aren't comparable with new ones. The same laptop measured every renderer slower on 2026-10-19, so only ratios within one session are meaningful.
- A debuff release has to publish the spryte version core depends on first (or in the same `changeset publish`).
