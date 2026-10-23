/**
 * Official templates that are not bundled into the create-debuff package. They're downloaded on
 * demand from the debuff repo, so adding templates never grows the npm download.
 */
import type { TemplateKind } from "./scaffold.js";

export interface OfficialTemplate {
  id: string;
  title: string;
  description: string;
  kind: TemplateKind;
  /** giget source: where the template lives in the debuff repo. `create()` pins it to this release's tag. */
  source: string;
}

export const OFFICIAL_TEMPLATES: readonly OfficialTemplate[] = [
  {
    id: "topdown",
    kind: "base",
    title: "Top-down",
    description: "Walk a tile world from above: tenten sprites and tileset, 8-way movement, wall collision, a following camera, pickups",
    source: "github:debuffjp/debuff/templates/topdown",
  },
  {
    id: "isometric",
    kind: "base",
    title: "Isometric",
    description:
      "Walk a 2:1 isometric grid: tenten floor and cube tiles, depth sorting, grid-to-screen projection, a following camera, pickups",
    source: "github:debuffjp/debuff/templates/isometric",
  },
  {
    id: "sidescroller",
    kind: "base",
    title: "Side-scroller",
    description:
      "Run and jump through a side-scrolling level: tenten tileset and sprites, coyote time, jump buffering, one-way planks, a following camera, pickups",
    source: "github:debuffjp/debuff/templates/sidescroller",
  },
  {
    id: "pointclick",
    kind: "base",
    title: "Point-and-click",
    description:
      "Click to walk, look and use: rooms with exits and hotspots, an inventory, speech bubbles, a fade between rooms, tenten sprites",
    source: "github:debuffjp/debuff/templates/pointclick",
  },
  {
    id: "platformer",
    kind: "example",
    title: "Platformer",
    description: "buff runs and jumps through a Tiled level: tilemap, collision, atlas, tunable movement, coins",
    source: "github:debuffjp/debuff/templates/platformer",
  },
  {
    id: "mossfell",
    kind: "example",
    title: "Mossfell",
    description:
      "Top-down action-adventure: screen-by-screen scrolling, sword combat, hearts, enemies, a key and locked door, a small dungeon",
    source: "github:debuffjp/debuff/templates/mossfell",
  },
  {
    id: "squish",
    kind: "example",
    title: "Match 3",
    description:
      "Squishy match-3 for touch and mouse: swap jelly blobs, cascades and combos, squash-and-stretch juice, drawn in code with no art files",
    source: "github:debuffjp/debuff/templates/squish",
  },
];
