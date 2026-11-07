# Golden frames for the showcase scenes

Reference frames for `showcase-rain` and `showcase-warp`, made with [komadori](https://github.com/debuffjp/komadori). A pull request that touches spryte renders both scenes in CI and compares three frames of each (0, 60 and 119 of 120, at 640 by 360) with these. A frame that no longer matches fails the check, and the `golden-diffs` artifact shows the difference.

These are what the scenes are expected to look like, not generated files to ignore. A change that moves them on purpose should say so in its pull request, and the new frames go in the same commit.

## Check or replace them

Build the scene, then run komadori against it. `--outDir` has to be an absolute path, because Vite resolves it against the example's folder.

```bash
npm run build -w spryte
npx vite build packages/spryte/examples/showcase-rain --outDir "$PWD/golden-dist/rain"
npx komadori golden-dist/rain --frames 120 --samples 3 --size 640x360 \
  --golden packages/spryte/golden/showcase-rain --out golden-out/rain
```

Use `showcase-warp` for the other scene. The settings must match the ones the frames were made with. To replace the frames, run `npx komadori approve` with the same settings and `--yes`, but only after looking at the new frames, because it changes what every later run is compared with. komadori's documentation covers the options and the limits.

## The limit for warp

The frames were made on a Radeon 780M. CI renders on a Linux runner with SwiftShader, so komadori compares with its looser cross-renderer limit and prints a warning that says so.

Rain passes at the default limit. Warp needs a wider one, `--golden-tolerance 0.5`. On the first Linux run it differed by 0.27 to 0.28% of the pixels against a 0.25% limit, and nothing in the scene had changed. The outlines of the word "WARP" differed, because the scene draws it with `sans-serif` and Linux rasterises text differently, along with a faint speckle across the stars. With 0.5% warp passed on the Linux runner.

That limit catches changes to the stars: recolouring them changed 12 to 16% of the pixels in a local check. It does not catch a small change to the title. Moving the title's shadow 6 px down passed. So the warp frames guard the starfield, not the lettering.

The 0.5% figure comes from one Linux run. The checks with deliberate changes ran on Windows with SwiftShader, not on the runner.
