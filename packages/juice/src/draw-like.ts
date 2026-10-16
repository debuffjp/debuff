/** The parts of `@debuffjp/core`'s `Draw` that juice effects use. Structural, so juice has no dependencies. */
export interface DrawLike {
  alpha: number;
  rect(x: number, y: number, w: number, h: number, color: string | number): void;
  circle(x: number, y: number, radius: number, color: string | number): void;
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: string | number): void;
  blend(mode: "normal" | "add"): void;
}
