// A sprite pool: the typed arrays draw.sprites takes, with add and remove. A prototype for ADR 0018.
import type { Draw, Frame, SpriteDrawOptions, SpritesEach, TextureSource } from "spryte";

/** Per-copy fields the pool allocates. Position is always there. */
export interface PoolFields {
  scale?: boolean;
  rotation?: boolean;
  color?: boolean;
  frame?: boolean;
}

/**
 * Sprites as entries in typed arrays, drawn in one `draw.sprites` call. `add()` returns a handle that stays
 * valid until `remove(handle)`; removing swaps the last entry into the gap, so the arrays stay packed and
 * draw order changes. Entries are read by slot: `slot(handle)` gives the index into `x`/`y` and the rest.
 */
export class SpritePool {
  count = 0;
  /** x, y pairs. */
  positions: Float32Array;
  scale: Float32Array | undefined;
  rotation: Float32Array | undefined;
  color: Uint32Array | undefined;
  frame: Uint16Array | undefined;
  private slotOf: Int32Array;
  private handleAt: Int32Array;
  private free: number[] = [];
  private nextHandle = 0;
  private readonly each: SpritesEach = {};

  constructor(
    readonly source: Frame | TextureSource | readonly Frame[],
    readonly fields: PoolFields = {},
    capacity = 1024,
  ) {
    this.positions = new Float32Array(capacity * 2);
    this.slotOf = new Int32Array(capacity).fill(-1);
    this.handleAt = new Int32Array(capacity);
    if (fields.scale) this.scale = new Float32Array(capacity);
    if (fields.rotation) this.rotation = new Float32Array(capacity);
    if (fields.color) this.color = new Uint32Array(capacity);
    if (fields.frame) this.frame = new Uint16Array(capacity);
    this.link();
  }

  get capacity(): number {
    return this.handleAt.length;
  }

  /** Add a sprite at x, y with scale 1, no rotation, white and frame 0. Returns its handle. */
  add(x: number, y: number): number {
    if (this.count === this.capacity) this.grow();
    const slot = this.count++;
    const handle = this.free.length > 0 ? (this.free.pop() as number) : this.nextHandle++;
    if (handle >= this.slotOf.length) this.slotOf = resize(this.slotOf, this.slotOf.length * 2, -1);
    this.slotOf[handle] = slot;
    this.handleAt[slot] = handle;
    this.positions[slot * 2] = x;
    this.positions[slot * 2 + 1] = y;
    if (this.scale) this.scale[slot] = 1;
    if (this.rotation) this.rotation[slot] = 0;
    if (this.color) this.color[slot] = 0xffffffff;
    if (this.frame) this.frame[slot] = 0;
    return handle;
  }

  /** Remove a sprite. The last sprite moves into its slot. */
  remove(handle: number): void {
    const slot = this.slotOf[handle] ?? -1;
    if (slot < 0) throw new RangeError(`SpritePool: no sprite with handle ${handle}`);
    const last = --this.count;
    if (slot !== last) {
      const moved = this.handleAt[last] as number;
      this.copySlot(last, slot);
      this.handleAt[slot] = moved;
      this.slotOf[moved] = slot;
    }
    this.slotOf[handle] = -1;
    this.free.push(handle);
  }

  /** The slot a handle's data is at, or -1 once removed. Slots change when other sprites are removed. */
  slot(handle: number): number {
    return this.slotOf[handle] ?? -1;
  }

  /** The handle of the sprite in a slot, for loops over slots that need to remove. */
  handle(slot: number): number {
    return this.handleAt[slot] as number;
  }

  clear(): void {
    for (let s = 0; s < this.count; s++) {
      const h = this.handleAt[s] as number;
      this.slotOf[h] = -1;
      this.free.push(h);
    }
    this.count = 0;
  }

  /** Draw every sprite in one call. `options` apply to all of them, like draw.sprites'. */
  draw(draw: Draw, options?: SpriteDrawOptions): void {
    if (this.count > 0) draw.sprites(this.source, this.positions, this.count, options, this.each);
  }

  private copySlot(from: number, to: number): void {
    const p = this.positions;
    p[to * 2] = p[from * 2] as number;
    p[to * 2 + 1] = p[from * 2 + 1] as number;
    if (this.scale) this.scale[to] = this.scale[from] as number;
    if (this.rotation) this.rotation[to] = this.rotation[from] as number;
    if (this.color) this.color[to] = this.color[from] as number;
    if (this.frame) this.frame[to] = this.frame[from] as number;
  }

  private grow(): void {
    const n = this.capacity * 2;
    this.positions = resize(this.positions, n * 2);
    this.handleAt = resize(this.handleAt, n);
    if (this.scale) this.scale = resize(this.scale, n);
    if (this.rotation) this.rotation = resize(this.rotation, n);
    if (this.color) this.color = resize(this.color, n);
    if (this.frame) this.frame = resize(this.frame, n);
    this.link();
  }

  // draw.sprites reads the arrays through `each`, so point it at the current ones after every growth.
  private link(): void {
    const e = this.each as { -readonly [K in keyof SpritesEach]: SpritesEach[K] };
    e.scale = this.scale;
    e.rotation = this.rotation;
    e.color = this.color;
    e.frame = this.frame;
  }
}

function resize<T extends Float32Array | Uint32Array | Uint16Array | Int32Array>(a: T, n: number, fill = 0): T {
  const b = new (a.constructor as new (n: number) => T)(n);
  b.set(a);
  if (fill !== 0) b.fill(fill, a.length);
  return b;
}
