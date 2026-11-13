import type { TextureSource } from "./backend.js";

/** A uniform value: a float, or a vec2/vec3/vec4 as an array. */
export type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];

/**
 * Values for a uniform array such as `uniform vec4 pool[64];`, packed flat: 4 numbers per `vec4`, so `pool[1]`
 * starts at index 4. Since spryte 0.13.
 */
export type UniformArray = Float32Array | readonly number[];

/** Options for a texture set with `Shader.set(name, texture)`. Since spryte 0.13. */
export interface ShaderTextureOptions {
  /** Linear filtering (trilinear on mipmapped images). Default false: nearest, so each texel reads exactly. */
  smooth?: boolean;
}

/**
 * A custom fragment effect, applied to everything drawn inside `draw.withShader(shader, fn)`.
 *
 * The source defines `vec4 effect(vec4 color, highp vec2 uv)`, which returns the pixel's colour. Keep `uv` and any
 * texture coordinate you compute `highp`: the default precision is mediump, fp16 on many mobile GPUs, too coarse
 * for images past about 1024 px (before 0.16, `source(uv)` itself dropped uv to mediump). `color` is the
 * draw's tint and alpha, premultiplied. `source(uv)` samples the image being drawn. `uv` is in texture (atlas)
 * space, so it isn't 0 to 1 across a sprite packed into an atlas, and on a render target `uv.y` runs bottom to top:
 * `frameUv()` gives the position inside the drawn frame instead, from (0, 0) at its top left to (1, 1) at its
 * bottom right (since spryte 0.10). Declare your own uniforms and set them with `set()`. Return premultiplied
 * colour (rgb already multiplied by alpha).
 *
 * `rect()`, `line()` and `circle()` run the effect with `frameUv()` across them, so a full-screen vignette can be
 * a `rect()` over the view with no render target. The vector shapes (`polygon`, `polyline`, `roundRect`, `ring`)
 * and `mesh` draw without the effect. Up to 0.12.3 this comment said shapes get (0, 0), which was wrong for both.
 *
 * ```ts
 * const wave = draw.createShader(`
 *   uniform float time;
 *   vec4 effect(vec4 color, highp vec2 uv) {
 *     uv.x += sin(uv.y * 40.0 + time * 6.0) * 0.01;
 *     return source(uv) * color;
 *   }
 * `);
 * wave.set("time", t);
 * draw.withShader(wave, () => draw.sprite(hero, x, y));
 * ```
 *
 * Since spryte 0.13, `set()` also takes uniform arrays and textures:
 *
 * ```ts
 * const fx = draw.createShader(`
 *   uniform vec4 pool[64];
 *   uniform sampler2D noise;
 *   vec4 effect(vec4 color, highp vec2 uv) {
 *     float n = texture(noise, frameUv()).r;
 *     return source(uv) * color * pool[0].a * n;
 *   }
 * `);
 * fx.set("pool", poolValues); // Float32Array of 64 * 4 numbers
 * fx.set("noise", noiseCanvas, { smooth: true });
 * ```
 *
 * WebGL2 only. On the Canvas 2D fallback, drawing inside `withShader` happens without the effect (warned once).
 */
export class Shader {
  /** @internal Uniform values by name: floats, vectors and arrays. */
  readonly uniforms = new Map<string, UniformValue | UniformArray>();
  /** @internal Textures for `sampler2D` uniforms by name. */
  readonly textures = new Map<string, { source: TextureSource; smooth: boolean }>();
  /**
   * @internal Called before a uniform changes, so pending draws flush with the old value first. The renderer
   * drawing with this shader also checks the new value here and throws if it can't take it.
   */
  onChange: ((name: string, value: UniformValue | UniformArray | TextureSource) => void) | undefined;

  constructor(readonly source: string) {
    if (!/\bvec4\s+effect\s*\(/.test(source)) throw new Error("spryte: a shader must define `vec4 effect(vec4 color, highp vec2 uv)`");
  }

  /**
   * Set a uniform declared in the source. Applies to draws made after this call. A name the GLSL compiler
   * removed because the effect never reads it is ignored, whatever the value.
   *
   * - A number sets a `float`. A 2, 3 or 4 number tuple sets a `vec2`, `vec3` or `vec4`.
   * - A `Float32Array` or number array sets a `float`, `vec2`, `vec3` or `vec4` array (since 0.13), packed flat.
   *   Its length must be a whole number of elements and at most the declared size: 10 numbers for a `vec4`
   *   array throws an error naming the uniform. A shorter array sets the first elements and leaves the rest.
   *   The array is read when the batch draws, so call `set()` again after changing its contents.
   * - A texture (an image, canvas, `ImageBitmap` or `RenderTarget`) sets a `sampler2D` (since 0.13). Read it with
   *   `texture(name, uv)`, where `uv` runs 0 to 1 across the whole texture: from the top row of an image, but
   *   from the bottom row of a render target. Colours are premultiplied. A shader can't sample the render target
   *   it is drawing into: `set()`, `withShader` or `into()` throws when that would happen. Each `sampler2D` gets
   *   its own texture unit from 8 up, fixed per program, because units 0 to 7 hold the sprites of a batch.
   *   WebGL2 guarantees 16 units, so a shader can count on 8 textures; one that reads more than the GPU has
   *   units for throws when first used. Filtering is nearest unless `options.smooth` is true.
   *
   * A changed value ends the current batch, so the sprites queued before it draw with the old one. Since 0.16,
   * the value a uniform already has keeps the batch: numbers and arrays compare by value, and a texture or the
   * same array object passed again always counts as a change. To vary an effect per sprite, keep one
   * `withShader` around the whole walk and pass the per-sprite value with the draw instead of calling `set()`.
   *
   * A wrong kind of value (a texture on a `float`, an array on a `sampler2D`) throws too. All of these throw at
   * `set()` while the shader is in use, or when `withShader` or `into()` would start using values set earlier,
   * and always before anything changes. On the Canvas 2D fallback shaders don't run, so nothing is checked and
   * the draws happen without the effect.
   *
   * ```ts
   * fx.set("time", 1.5);                          // float
   * fx.set("pool", new Float32Array(64 * 4));     // uniform vec4 pool[64], packed flat
   * fx.set("noise", noiseCanvas, { smooth: true }); // uniform sampler2D noise
   * ```
   */
  set(name: string, value: UniformValue | UniformArray): this;
  set(name: string, texture: TextureSource, options?: ShaderTextureOptions): this;
  set(name: string, value: UniformValue | UniformArray | TextureSource, options?: ShaderTextureOptions): this {
    if (sameValue(this.uniforms.get(name), value)) return this;
    this.onChange?.(name, value);
    if (typeof value === "number" || Array.isArray(value) || value instanceof Float32Array) {
      this.textures.delete(name);
      this.uniforms.set(name, value as UniformValue | UniformArray);
    } else {
      this.uniforms.delete(name);
      this.textures.set(name, { source: value as TextureSource, smooth: options?.smooth === true });
    }
    return this;
  }
}

/**
 * Whether `next` equals the stored uniform value, so `set()` can keep the batch. The same array object never
 * counts: its contents may have changed since it was stored, and it is read only when the batch draws.
 */
function sameValue(prev: UniformValue | UniformArray | undefined, next: unknown): boolean {
  if (typeof prev === "number") return prev === next;
  if (prev === undefined || prev === next || !(Array.isArray(next) || next instanceof Float32Array)) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) return false;
  return true;
}
