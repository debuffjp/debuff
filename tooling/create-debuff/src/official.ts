/**
 * Official templates that are not bundled into the create-debuff package. They're downloaded on
 * demand from the debuff repo, so adding templates never grows the npm download.
 */
export interface OfficialTemplate {
  id: string;
  title: string;
  description: string;
  /** giget source: where the template lives in the debuff repo. `create()` pins it to this release's tag. */
  source: string;
}

export const OFFICIAL_TEMPLATES: readonly OfficialTemplate[] = [
  {
    id: "platformer",
    title: "Platformer",
    description: "buff runs and jumps through a Tiled level: tilemap, collision, atlas, tunable movement, coins",
    source: "github:debuffjp/debuff/templates/platformer",
  },
  {
    id: "mossfell",
    title: "Mossfell",
    description:
      "Top-down action-adventure: screen-by-screen scrolling, sword combat, hearts, enemies, a key and locked door, a small dungeon",
    source: "github:debuffjp/debuff/templates/mossfell",
  },
];
