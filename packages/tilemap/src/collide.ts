import { Collision, type Tilemap } from "./tilemap.js";

/** An axis-aligned box in world pixels; `x, y` is the top-left corner. */
export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveResult {
  /** Blocked while moving horizontally. */
  hitX: boolean;
  /** Blocked while moving vertically. */
  hitY: boolean;
  /** Landed on something (solid or one-way) while moving down. */
  onGround: boolean;
  /** Hit a ceiling while moving up. */
  hitCeiling: boolean;
  /** Hit a wall on the left or right. */
  hitLeft: boolean;
  hitRight: boolean;
}

export interface MoveOptions {
  /** Pass through one-way platforms (e.g. while holding down to drop). */
  dropThrough?: boolean;
  /**
   * How far (in pixels) a falling body may already be inside a one-way tile and still land on it, snapping
   * up to its top. Set it to the platform art's thickness so a jump that visually reaches the plank catches it.
   * Default 0.
   */
  oneWayTolerance?: number;
}

const EPS = 1e-6;

/**
 * Move a body through the map, stopping at solid tiles. X then Y are resolved separately, and long
 * moves are split into tile-sized sub-steps so fast bodies never tunnel. One-way tiles only block a
 * body moving down whose bottom started at or above the tile's top (plus `oneWayTolerance`). Mutates `body.x/y`.
 */
export function move(map: Tilemap, body: Body, dx: number, dy: number, options: MoveOptions = {}): MoveResult {
  const result: MoveResult = { hitX: false, hitY: false, onGround: false, hitCeiling: false, hitLeft: false, hitRight: false };
  const stepsX = Math.max(1, Math.ceil(Math.abs(dx) / map.tileWidth));
  const stepX = dx / stepsX;
  for (let i = 0; i < stepsX && !result.hitX; i++) moveX(map, body, stepX, result);
  const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / map.tileHeight));
  const stepY = dy / stepsY;
  for (let i = 0; i < stepsY && !result.hitY; i++) moveY(map, body, stepY, result, options);
  return result;
}

function moveX(map: Tilemap, body: Body, dx: number, result: MoveResult): void {
  if (dx === 0) return;
  const { tileWidth: tw, tileHeight: th } = map;
  const top = Math.floor(body.y / th);
  const bottom = Math.floor((body.y + body.h - EPS) / th);
  if (dx > 0) {
    const edge = body.x + body.w + dx;
    const col = Math.floor((edge - EPS) / tw);
    for (let row = top; row <= bottom; row++) {
      if (map.collisionAt(col, row) === Collision.Solid) {
        body.x = col * tw - body.w;
        result.hitX = result.hitRight = true;
        return;
      }
    }
  } else {
    const edge = body.x + dx;
    const col = Math.floor(edge / tw);
    for (let row = top; row <= bottom; row++) {
      if (map.collisionAt(col, row) === Collision.Solid) {
        body.x = (col + 1) * tw;
        result.hitX = result.hitLeft = true;
        return;
      }
    }
  }
  body.x += dx;
}

function moveY(map: Tilemap, body: Body, dy: number, result: MoveResult, options: MoveOptions): void {
  if (dy === 0) return;
  const { tileWidth: tw, tileHeight: th } = map;
  const left = Math.floor(body.x / tw);
  const right = Math.floor((body.x + body.w - EPS) / tw);
  if (dy > 0) {
    const bottom = body.y + body.h;
    const row = Math.floor((bottom + dy - EPS) / th);
    const rowTop = row * th;
    for (let col = left; col <= right; col++) {
      const kind = map.collisionAt(col, row);
      const blocks =
        kind === Collision.Solid ||
        (kind === Collision.OneWay && !options.dropThrough && bottom <= rowTop + (options.oneWayTolerance ?? 0) + EPS);
      if (blocks) {
        body.y = rowTop - body.h;
        result.hitY = result.onGround = true;
        return;
      }
    }
  } else {
    const row = Math.floor((body.y + dy) / th);
    for (let col = left; col <= right; col++) {
      if (map.collisionAt(col, row) === Collision.Solid) {
        body.y = (row + 1) * th;
        result.hitY = result.hitCeiling = true;
        return;
      }
    }
  }
  body.y += dy;
}

/** True if a body overlaps any solid tile (e.g. to check whether it can stand up). */
export function overlapsSolid(map: Tilemap, body: Body): boolean {
  const { tileWidth: tw, tileHeight: th } = map;
  for (let row = Math.floor(body.y / th); row <= Math.floor((body.y + body.h - EPS) / th); row++) {
    for (let col = Math.floor(body.x / tw); col <= Math.floor((body.x + body.w - EPS) / tw); col++) {
      if (map.collisionAt(col, row) === Collision.Solid) return true;
    }
  }
  return false;
}
