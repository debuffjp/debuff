# @debuff/tilemap

Tilemaps for debuff: culled, batched rendering through `draw`, tile collision, and importers for [Tiled](https://www.mapeditor.org/) and [LDtk](https://ldtk.io/).

```ts
import { fromTiled } from "@debuff/tilemap";

const map = fromTiled(assets.json("level1"), { image: (path) => assets.image("tiles") });
const player = { x: 32, y: 32, w: 12, h: 14 };

// update(dt)
const hit = map.move(player, vx * dt, vy * dt);
if (hit.onGround) vy = 0;

// render(draw)
draw.withCamera(game.camera, () => map.draw(draw, { camera: game.camera }));
```

## Building maps

- **Tiled** (`.tmj`): `fromTiled(json, { image, tilesets? })`. Orthogonal maps, CSV or uncompressed Base64, infinite maps, layer groups (offsets, opacity, parallax), flip and rotation flags, external tilesets, object layers.
- **LDtk** (`.ldtk`): `fromLdtk(project, { level?, image, intGrid? })`. Tiles, AutoLayer (stacked tiles become extra layers), IntGrid collision, entities and level fields.
- **In code**: `new Tilemap({ width, height, tileWidth, tileHeight, tilesets, layers })`, then `map.set(layer, col, row, id)`. Useful for procedural levels.

## Collision

| Source | Becomes |
| --- | --- |
| Tiled tile property `solid` / `collides` | solid |
| Tiled tile property `oneWay` | one-way (solid from above) |
| Tiled layer property `collision: true` | every tile in the layer is solid |
| LDtk IntGrid value | solid; values named `oneWay`, `one_way` or `platform` are one-way; override with `intGrid` |
| Code | `map.setCollision(col, row, Collision.Solid)` |

`map.move(body, dx, dy, { dropThrough? })` moves an `{ x, y, w, h }` box, resolving X then Y. It splits fast moves into tile-sized steps so nothing tunnels, and returns `onGround`, `hitCeiling`, `hitLeft`, `hitRight`. `map.edges` controls which map borders are solid (default: sides solid, top and bottom open).

## API

- `map.draw(draw, { camera?, layers? })`: draws only tiles in view, applies parallax, no per-tile allocation
- `map.get / set / tileAt`, `map.tileProperties(id)`, `map.objects(layer)`, `map.properties`
- `map.collisionAt(col, row)`, `map.collideFrom(layers, { everyTile? })`, `overlapsSolid(map, body)`
- The asset pipeline loads `.tmj`, `.tsj` and `.ldtk` files as JSON
