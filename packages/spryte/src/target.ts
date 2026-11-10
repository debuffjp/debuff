/**
 * How a render target stores each pixel. `rgba8` (the default) holds 0 to 1 in 8 bits a channel. `rgba16f` holds
 * half floats, so values can pass 1 (light that adds up, bloom thresholds) and dark gradients don't band. Since 0.13.
 */
export type TargetFormat = "rgba8" | "rgba16f";

/** Options for `draw.createTarget`. */
export interface TargetOptions {
  /**
   * The storage you'd like. `rgba16f` needs WebGL2 with `EXT_color_buffer_float` or `EXT_color_buffer_half_float`;
   * elsewhere (Canvas 2D, older phones) the target falls back to `rgba8`. Read `target.format` for what you got.
   */
  format?: TargetFormat;
}

/**
 * An offscreen image you draw into with `draw.into(target, fn)` and then draw like any image:
 * post-processing, cached static layers, minimaps, trails. Size is in pixels.
 *
 * On WebGL2 the contents live on the GPU and are lost if the context is lost: redraw them when
 * `draw.contextLost` turns false again, or redraw every frame.
 */
export class RenderTarget {
  constructor(
    readonly width: number,
    readonly height: number,
    /** The storage this target really has, after any fallback. */
    readonly format: TargetFormat = "rgba8",
  ) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0))
      throw new Error(`spryte: render target size must be positive whole pixels, got ${width}×${height}`);
  }
}
