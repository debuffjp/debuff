/** The parts of `@debuffjp/core`'s `Draw` that ui uses. Structural, so ui has no dependencies. */
export interface DrawLike {
  alpha: number;
  rect(x: number, y: number, w: number, h: number, color: string | number): void;
  text(
    text: string,
    x: number,
    y: number,
    options?: { font?: string; color?: string | number; align?: "left" | "center" | "right"; baseline?: "top" | "middle" | "bottom" },
  ): void;
}

/** The part of `@debuffjp/input`'s `Input` that `Menu` reads. */
export interface InputLike<A extends string = string> {
  pressed(action: A): boolean;
}
