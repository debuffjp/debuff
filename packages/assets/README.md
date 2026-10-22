# @debuffjp/assets

Runtime loader for the manifest that `debuff` generates from your project's `assets/` folder. No dependencies.

```ts
import { Assets } from "@debuffjp/assets";
import { Sprite } from "@debuffjp/core";

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load("default", ({ loaded, total }) => showProgress(loaded / total));

const hero = new Sprite({ frames: assets.frames("hero") }); // hero@16x24.png, sliced on its grid
draw.sprite(assets.frame("coin"), x, y); // any image, atlased or not
```

## Conventions (from the asset compiler)

| File | Asset id | Group |
| --- | --- | --- |
| `assets/logo.png` | `logo` | `default` |
| `assets/level1/map.json` | `level1/map` | `level1` |
| `assets/hero@16x24.png` | `hero` (grid 16x24) | `default` |

## API

- `load(groups?, onProgress?)`: preload one or more groups
- `fetch(id)`: lazy-load a single asset; concurrent calls share one request
- `frame(id)`: `{ image, x, y, w, h }` for `draw.sprite`; works for atlased and standalone images
- `frames(id)`: sprite-sheet frames from the `name@WxH` grid
- `image(id)` (standalone images only), `json(id)`, `audio(id)`, `text(id)`, `entry(id)`, `has(id)`

## Atlases

The CLI packs PNGs into atlases per preload group, in dev and in builds, so a level loads one texture instead of dozens. It's lossless, with padding that prevents edge bleeding. Images over half the atlas size stay standalone. Configure or disable it in `debuff.config.ts`:

```ts
export default defineConfig({ assets: { atlas: { maxSize: 2048, padding: 2, exclude: ["ui/"] } } }); // or atlas: false
```
- Errors are `AssetError` with the asset `id` and a suggested fix
