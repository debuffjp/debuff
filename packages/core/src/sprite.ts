import type { Color, Draw, Frame, TextureSource } from "@debuffjp/sprig";

export type { Frame };

/** Slice a uniform sprite sheet into frames, row-major. */
export function sliceGrid(image: TextureSource & { width: number; height: number }, frameWidth: number, frameHeight: number): Frame[] {
  const cols = Math.floor(image.width / frameWidth);
  const rows = Math.floor(image.height / frameHeight);
  const frames: Frame[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) frames.push({ image, x: c * frameWidth, y: r * frameHeight, w: frameWidth, h: frameHeight });
  }
  return frames;
}

export interface AnimationClip {
  /** Indices into the sprite's frame list. */
  frames: readonly number[];
  /** Frames per second. */
  fps: number;
  loop?: boolean;
}

export type Origin = "top-left" | "center" | "bottom-center" | [number, number];

export interface SpriteOptions {
  frames: readonly Frame[];
  animations?: Record<string, AnimationClip>;
  x?: number;
  y?: number;
  origin?: Origin;
}

/** Drawable frame sequence with transform, tint flash and named animations. */
export class Sprite {
  x: number;
  y: number;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  alpha = 1;
  flipX = false;
  visible = true;
  /** 0..1 white overlay, for impact flashes. */
  flash = 0;
  /** Colour multiplier. */
  tint: Color | undefined;
  origin: Origin;
  frame = 0;

  readonly frames: readonly Frame[];
  readonly animations: Record<string, AnimationClip>;
  private clip: AnimationClip | undefined;
  private clipName: string | undefined;
  private clipTime = 0;
  private finished = false;

  constructor(options: SpriteOptions) {
    if (options.frames.length === 0) throw new Error("Sprite needs at least one frame");
    this.frames = options.frames;
    this.animations = options.animations ?? {};
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.origin = options.origin ?? "center";
  }

  get animation(): string | undefined {
    return this.clipName;
  }

  /** True once a non-looping animation reaches its last frame. */
  get done(): boolean {
    return this.finished;
  }

  /** Play a named animation. Re-playing the current one does nothing unless `restart`. */
  play(name: string, restart = false): void {
    if (this.clipName === name && !restart) return;
    const clip = this.animations[name];
    if (!clip) throw new Error(`Unknown animation "${name}". Known: ${Object.keys(this.animations).join(", ") || "none"}`);
    this.clip = clip;
    this.clipName = name;
    this.clipTime = 0;
    this.finished = false;
    this.frame = clip.frames[0] ?? 0;
  }

  update(dt: number): void {
    const clip = this.clip;
    if (!clip || clip.frames.length === 0) return;
    this.clipTime += dt;
    let index = Math.floor(this.clipTime * clip.fps);
    if (clip.loop ?? true) index %= clip.frames.length;
    else if (index >= clip.frames.length - 1) {
      index = clip.frames.length - 1;
      this.finished = true;
    }
    this.frame = clip.frames[index] ?? 0;
  }

  draw(draw: Draw): void {
    if (!this.visible || this.alpha <= 0) return;
    const f = this.frames[this.frame];
    if (!f) return;
    const [ox, oy] = originOffset(this.origin, f.w, f.h);
    draw.sprite(f, this.x, this.y, {
      origin: [ox / f.w, oy / f.h],
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      rotation: this.rotation,
      flipX: this.flipX,
      alpha: this.alpha,
      flash: this.flash,
      ...(this.tint === undefined ? {} : { tint: this.tint }),
    });
  }
}

export function originOffset(origin: Origin, w: number, h: number): [number, number] {
  if (Array.isArray(origin)) return [origin[0] * w, origin[1] * h];
  switch (origin) {
    case "top-left":
      return [0, 0];
    case "center":
      return [w / 2, h / 2];
    case "bottom-center":
      return [w / 2, h];
  }
}
