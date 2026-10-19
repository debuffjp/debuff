/** A CSS font string or a font object such as `@debuffjp/core`'s `BitmapFont`. */
export type FontLike = string | object;

export interface TextOptions {
  font?: FontLike | undefined;
  color?: string | number;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
}

/** The parts of `@debuffjp/core`'s `Draw` that ui uses. Structural, so ui has no dependencies. */
export interface DrawLike {
  alpha: number;
  rect(x: number, y: number, w: number, h: number, color: string | number): void;
  /** Filled circle. Optional: when present, panels with a `radius` get round corners. */
  circle?(x: number, y: number, radius: number, color: string | number): void;
  text(text: string, x: number, y: number, options?: TextOptions): void;
  /** The box `text()` fills, in logical pixels. */
  measure(text: string, font?: FontLike): { w: number; h: number };
}

/** The part of `@debuffjp/input`'s `Input` that `Menu` reads. */
export interface InputLike<A extends string = string> {
  pressed(action: A): boolean;
  /** When present, tapping or clicking a row selects it. */
  pointer?: { x: number; y: number; pressed: boolean };
}
