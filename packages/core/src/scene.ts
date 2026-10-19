import type { Draw } from "@debuffjp/sprig";
import type { Game } from "./game.js";

/** A scene owns a slice of game state. Lifecycle: enter → (update/render)* → exit. */
export interface Scene {
  readonly id: string;
  enter?(game: Game): void;
  update?(dt: number, game: Game): void;
  /** `alpha` is the fraction between the last and next simulation step, for interpolation. */
  render?(draw: Draw, alpha: number, game: Game): void;
  exit?(game: Game): void;
  /** JSON-serialisable snapshot for dev tools and scenario assertions. Not called in production. */
  inspect?(): unknown;
}
