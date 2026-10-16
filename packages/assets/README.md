# @debuff/assets

Runtime loader for the manifest that `debuff` generates from `public/assets/`. No dependencies.

```ts
import { Assets } from "@debuff/assets";
import { sliceGrid } from "@debuff/core";

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load("default", ({ loaded, total }) => showProgress(loaded / total));

const hero = assets.entry("hero"); // from hero@16x24.png
const frames = sliceGrid(assets.image("hero"), hero.grid!.frameWidth, hero.grid!.frameHeight);
```

## Conventions (from the asset compiler)

| File | Asset id | Group |
| --- | --- | --- |
| `public/assets/logo.png` | `logo` | `default` |
| `public/assets/level1/map.json` | `level1/map` | `level1` |
| `public/assets/hero@16x24.png` | `hero` (grid 16×24) | `default` |

## API

- `load(groups?, onProgress?)`: preload one or more groups
- `fetch(id)`: lazy-load a single asset; concurrent calls share one request
- `image(id)`, `json(id)`, `audio(id)`, `text(id)`, `entry(id)`, `has(id)`
- Errors are `AssetError` with the asset `id` and a suggested fix
