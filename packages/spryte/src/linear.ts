/** WebGL2 contexts made with `blendSpace: "linear"`. Shaders linked on them get `SPRYTE_LINEAR` defined. */
export const linearContexts = new WeakSet<WebGL2RenderingContext>();

const dataSources = new WeakSet<object>();

/**
 * Marks an image as data, not colour: an MSDF atlas, a noise or lookup table. Under `blendSpace: "linear"` colour
 * images are stored as sRGB so sampling returns linear light; a data image keeps its bytes as they are, which
 * is what a shader reading distances or indices needs. Call it before the image is first drawn. Has no effect
 * under the default sRGB blending. Returns the image.
 *
 * `{ premultiply: false }` (since 0.16) also uploads the image with straight alpha, under either blending, so
 * colour channels survive where alpha is below 255: timings or indices packed into RGBA. Without it, uploads
 * multiply colour by alpha, and a pixel with alpha 0 loses its colour. It applies to images and `ImageBitmap`s;
 * a canvas already holds premultiplied pixels, and an `ImageBitmap` keeps the `premultiplyAlpha` it was made
 * with, so use `createImageBitmap(blob, { premultiplyAlpha: "none" })` there. Read such an image in a custom
 * shader: drawn as a sprite, straight alpha blends wrong.
 */
export function asData<T extends object>(source: T, options?: { premultiply?: boolean }): T {
  dataSources.add(source);
  if (options?.premultiply === false) straightSources.add(source);
  return source;
}

const straightSources = new WeakSet<object>();

/** True for images passed to `asData(image, { premultiply: false })`. */
export const isStraight = (source: object): boolean => straightSources.has(source);

/**
 * The same mark, readable without importing spryte: a library that hands spryte its images (shodo's `fontFrames`)
 * sets `image[Symbol.for("spryte.data")] = true`. It also works when a bundle holds two copies of spryte.
 */
export const DATA_MARK: unique symbol = Symbol.for("spryte.data") as never;

/** True for images passed to `asData` or carrying {@link DATA_MARK}. */
export const isData = (source: object): boolean => dataSources.has(source) || (source as { [DATA_MARK]?: unknown })[DATA_MARK] === true;

/**
 * Prepended to every shader after `#version`. `spryte_toLinear` turns an sRGB colour into linear light under
 * `blendSpace: "linear"` and returns it unchanged otherwise, so a custom shader can convert its colour uniforms
 * once and work under both. `SPRYTE_LINEAR` is defined only in linear mode.
 */
export function prelude(linear: boolean): string {
  // Explicit highp: the prelude lands before a fragment shader's default precision statement.
  return `${linear ? "#define SPRYTE_LINEAR 1\n" : ""}highp vec3 spryte_toLinear(highp vec3 c) {
#ifdef SPRYTE_LINEAR
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
#else
  return c;
#endif
}
`;
}

/** An sRGB byte as linear light, 0 to 1, for clear colours set from the CPU. */
export function byteToLinear(b: number): number {
  const c = b / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
