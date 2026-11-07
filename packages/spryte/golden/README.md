# Golden frames for the showcase scenes

Reference frames for `showcase-rain` and `showcase-warp`, made and checked with [komadori](https://github.com/debuffjp/komadori). A pull request that touches spryte renders both scenes in CI and compares three frames of each (0, 60 and 119 of 120, at 640 by 360) with these. A frame that no longer matches fails the check, with the changed region and an image of the difference in the `golden-diffs` artifact.

These are not generated files to ignore: they are what the scenes are expected to look like. A change that moves them on purpose should say so in its pull request, and the new frames go in the same commit.

## Check them yourself

```bash
npm run build -w spryte
npx vite build packages/spryte/examples/showcase-rain --outDir "$PWD/golden-dist/rain"
node path/to/komadori/bin/komadori.mjs golden-dist/rain --frames 120 --samples 3 --size 640x360 \
  --golden packages/spryte/golden/showcase-rain --out golden-out/rain
```

`--outDir` has to be an absolute path: Vite resolves it against the example's folder. Use `showcase-warp` for the other scene. The golden settings (`--frames 120 --samples 3 --size 640x360`) must match the ones the frames were made with, or komadori says they don't instead of comparing.

## Replace them

Only a person should do this, after looking at the new frames, because it changes what every later run is compared with.

```bash
node path/to/komadori/bin/komadori.mjs approve golden-dist/rain --frames 120 --samples 3 --size 640x360 \
  --golden packages/spryte/golden/showcase-rain --yes
```

`approve` renders the scene twice and saves the frames only if the two runs match, so a scene that depends on the real clock or an unseeded random number can't be approved.

## What the limits are

These were made on a Radeon 780M (Direct3D). CI renders with SwiftShader (software Vulkan), which is a different renderer, so komadori uses its looser cross-renderer limits (0.25% of pixels, a mean of 0.5 out of 255) and prints a warning that says so. Both scenes were checked here on the Radeon, an RTX 5060 Laptop and SwiftShader, and passed on all three. A small real change (the ripple colour in the rain scene) failed on the Radeon and on SwiftShader.

## What isn't known

The warp scene draws the word "WARP" with `sans-serif`, and a Linux runner has different fonts from the machine these were made on. The comparison for warp reports but doesn't block until a run on Linux shows it is stable. The checks above ran on Windows, so the first Linux run is the real test of both scenes.
