# Renderer benchmark

Compares [spryte](../../packages/spryte) (and debuff, which renders through it) with PixiJS 8 and raw Canvas 2D, on the same assets and the same deterministic simulation. Results and how to read them: [`packages/spryte/docs/benchmarks.md`](../../packages/spryte/docs/benchmarks.md). The decision record is ADR 0013.

```bash
npm run build                                              # the bench imports the built spryte and core
npm run bench:renderer                                     # bunny scene, every renderer, 3 rounds
npm run bench:renderer -- mixed                            # or: particles
npm run bench:renderer -- particles spryte-bulk pixi-particle rounds=5
BENCH_NOTE="Pixel 7, Chrome, battery saver off" npm run bench:renderer   # anything the runner can't detect
PARITY_DUMP=1 npm run bench:renderer -- particles          # write the parity frames and diffs to results/parity/
```

## Scenes

| Scene | What every sprite does | Renderers |
| --- | --- | --- |
| `bunny` | One texture, position only | `canvas2d`, `spryte`, `spryte-bulk`, `debuff-2d`, `debuff-webgl`, `pixi-sprite`, `pixi-particle` |
| `mixed` | 4 separate textures; rotation, scale, tint and alpha, all changing over time | `spryte`, `debuff-webgl`, `pixi-sprite` |
| `particles` | One texture; position, scale, rotation, tint and alpha all changing every frame | `spryte-bulk`, `pixi-particle` (every dynamic property on) |

Like for like: `spryte` (`draw.sprite`, one call per sprite) pairs with `pixi-sprite` (`Sprite`). `spryte-bulk` (`draw.sprites`) pairs with `pixi-particle` (`ParticleContainer`). All use nearest filtering, no antialiasing, and whole-pixel rounding (PixiJS with `roundPixels: true`).

## Method

1. **Parity gate.** On fresh pages, each renderer draws the same seeded frame at 2,000 and at 50,000 sprites, which is compared with the reference renderer's. **Coverage** (drawn area relative to the reference) shows skipped or culled work. **Inside-sprite differences** count pixels that differ (any channel by more than 8 levels) where the 3×3 neighbourhood is one flat colour in both frames, so edges, where rounding rules differ, don't count but a wrong tint, alpha or texture does. The run fails if coverage leaves 99.5–100.5% or inside-sprite differences exceed 0.5%. Validation: a deliberately wrong PixiJS tint raised inside-sprite differences from 0% to 22%.
2. **Timing.** Each count runs 20 warm-up frames and 100 measured frames. A frame is timed from simulation to GPU completion, forced by a 1-pixel readback, so vsync and rAF pacing can't hide cost. Counts climb a ladder (1k, 2k, 5k, 10k, … 1.6M). Once a median frame exceeds 16.7 ms, only the published counts (10k, 50k, 200k) are still measured, so every renderer has them in every round.
3. **Rounds.** The whole ladder repeats for several rounds, with the renderer order rotated each round so heat and ordering spread evenly. Reported: the median across rounds, with min–max. "Max at 60 fps" is the largest ladder step measured in every round whose median frame is at most 16.7 ms (steps are up to 2× apart, so it's a lower bound).
4. **Environment.** Saved with every result: GPU, Chrome version, CPU, OS, memory, power source and plan (detected on Windows), the PixiJS version, the spryte version and commit, and `BENCH_NOTE`.

Results go to `results/<date>-<platform>-<scene>.json`. Commit results from new devices: phones and integrated GPUs especially.

## Phones and tablets

Desktop numbers don't predict phones. A phone's GPU is often limited by how fast it can fill pixels, not by the CPU, which is where most of spryte's lead comes from. There are three ways to measure on real devices, cheapest first:

1. **Your own phone, on your Wi-Fi.** `npm run build && npm run phone -w @debuffjp/bench-renderer`. Open `http://<this computer's LAN IP>:4800/mobile.html` on the phone, fill in the device note, and tap **Run**. Each renderer runs in a fresh iframe, and the page shows a table and copies the results as JSON. Keep the screen on and the tab in front. Windows may ask to allow Node through the firewall the first time.
2. **Anyone's phone, from the site.** Deploy `mobile.html` with the site (for example at debuff.jp/bench) and ask the community to run it and paste their JSON. This is the cheapest way to cover many devices, and a good launch asset.
3. **Cloud device farms, for devices you don't own.** BrowserStack's open-source program gives free access to its real-device cloud for public, licensed open-source projects (apply on their site). Open `mobile.html` in BrowserStack Live on a real iPhone or Android, or automate it with Playwright or Appium through BrowserStack Automate.

**Automating your own Android phone:** install Android platform-tools (adb), enable USB debugging, and Playwright's `_android` API can drive the phone's Chrome the same way `run.mjs` drives desktop Chrome. **iOS Safari** can't be automated from Windows. Use a Mac (Safari Web Inspector) or a device cloud, or simply run `mobile.html` by hand.

Device notes matter: include the model, OS and browser version, whether it was charging, and low-power mode. The page records what the browser exposes (user agent, GPU string, pixel ratio, core count, and battery state where available), but iOS hides the exact GPU and model.
