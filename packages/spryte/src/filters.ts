import { Shader, type UniformValue } from "./shader.js";

/**
 * A ready-made effect for `draw.filter(filters, fn)`. Make them with `blur()`, `colorMatrix()`, `grayscale()`
 * and friends; they're plain values, cheap to create every frame.
 */
export interface Filter {
  /** @internal GPU passes, run in order. `scale` is destination pixels per logical unit. */
  readonly passes: readonly FilterPass[];
  /** @internal The Canvas 2D equivalent as a CSS filter function, or null where there's none. */
  css(scale: number): string | null;
}

/** @internal */
export interface FilterPass {
  shader: Shader;
  uniforms(texelW: number, texelH: number, scale: number): [string, UniformValue][];
}

// Shared shaders, so filters made every frame never recompile. Samples outside the image are transparent,
// as in CSS filters.
let blurShader: Shader | undefined;
let matrixShader: Shader | undefined;

const BLUR = `
uniform vec2 dir;
uniform float sigma;
vec4 tap(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0))) ? source(uv) : vec4(0.0);
}
vec4 effect(vec4 color, vec2 uv) {
  float n = min(ceil(sigma * 3.0), 64.0);
  vec4 sum = tap(uv);
  float total = 1.0;
  for (int i = 1; i <= 64; i++) {
    float f = float(i);
    if (f > n) break;
    float k = exp(-f * f / (2.0 * sigma * sigma));
    sum += (tap(uv + dir * f) + tap(uv - dir * f)) * k;
    total += 2.0 * k;
  }
  return sum / total * color;
}`;

const MATRIX = `
uniform vec4 r;
uniform vec4 g;
uniform vec4 b;
uniform vec4 a;
uniform vec4 o;
vec4 effect(vec4 color, vec2 uv) {
  vec4 p = source(uv);
  vec4 c = p.a > 0.0 ? vec4(p.rgb / p.a, p.a) : vec4(0.0);
  vec4 q = clamp(vec4(dot(r, c), dot(g, c), dot(b, c), dot(a, c)) + o, 0.0, 1.0);
  return vec4(q.rgb * q.a, q.a) * color;
}`;

/**
 * Gaussian blur. `radius` is the standard deviation in logical units, the same as CSS `blur()`. Two passes;
 * very large blurs (over about 20 device pixels) are cut short, so blur a smaller target and scale it up instead.
 */
export function blur(radius: number): Filter {
  blurShader ??= new Shader(BLUR);
  const shader = blurShader;
  const pass = (x: number, y: number): FilterPass => ({
    shader,
    uniforms: (tw, th, scale) => [
      ["dir", [x * tw, y * th]],
      ["sigma", Math.max(radius * scale, 1e-3)],
    ],
  });
  return {
    passes: radius > 0 ? [pass(1, 0), pass(0, 1)] : [],
    css: (scale) => (radius > 0 ? `blur(${radius * scale}px)` : null),
  };
}

/**
 * Colour matrix: 20 numbers, four rows of `[r, g, b, a, offset]` (offset 0..1), applied to unpremultiplied
 * colour. WebGL2 only; on Canvas 2D this one draws unfiltered. The named filters below work on both.
 */
export function colorMatrix(m: readonly number[]): Filter {
  return matrix(m, null);
}

/** 0 (unchanged) to 1 (grey). CSS `grayscale()`. */
export function grayscale(amount = 1): Filter {
  const s = 1 - amount;
  return rgb(
    [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s],
    [0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s],
    [0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s],
    `grayscale(${amount})`,
  );
}

/** 0 (unchanged) to 1 (full sepia). CSS `sepia()`. */
export function sepia(amount = 1): Filter {
  const s = 1 - amount;
  return rgb(
    [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s],
    [0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s],
    [0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s],
    `sepia(${amount})`,
  );
}

/** 0 is grey, 1 unchanged, above 1 more vivid. CSS `saturate()`. */
export function saturate(amount: number): Filter {
  const s = amount;
  return rgb(
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    `saturate(${amount})`,
  );
}

/** Rotate hues by `radians`. CSS `hue-rotate()`. */
export function hueRotate(radians: number): Filter {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return rgb(
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
    `hue-rotate(${radians}rad)`,
  );
}

/** Multiply colour: 0 black, 1 unchanged. CSS `brightness()`. */
export function brightness(amount: number): Filter {
  return matrix([amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, 1, 0], `brightness(${amount})`);
}

/** 0 flat grey, 1 unchanged, above 1 more contrast. CSS `contrast()`. */
export function contrast(amount: number): Filter {
  const o = 0.5 - 0.5 * amount;
  return matrix([amount, 0, 0, 0, o, 0, amount, 0, 0, o, 0, 0, amount, 0, o, 0, 0, 0, 1, 0], `contrast(${amount})`);
}

/** 0 unchanged, 1 inverted. CSS `invert()`. */
export function invert(amount = 1): Filter {
  const k = 1 - 2 * amount;
  return matrix([k, 0, 0, 0, amount, 0, k, 0, 0, amount, 0, 0, k, 0, amount, 0, 0, 0, 1, 0], `invert(${amount})`);
}

function rgb(r: number[], g: number[], b: number[], css: string): Filter {
  return matrix([...r, 0, 0, ...g, 0, 0, ...b, 0, 0, 0, 0, 0, 1, 0], css);
}

function matrix(m: readonly number[], css: string | null): Filter {
  if (m.length !== 20) throw new Error(`spryte: a colour matrix has 20 numbers, got ${m.length}`);
  matrixShader ??= new Shader(MATRIX);
  const shader = matrixShader;
  const row = (i: number): UniformValue => [m[i] as number, m[i + 1] as number, m[i + 2] as number, m[i + 3] as number];
  const uniforms: [string, UniformValue][] = [
    ["r", row(0)],
    ["g", row(5)],
    ["b", row(10)],
    ["a", row(15)],
    ["o", [m[4] as number, m[9] as number, m[14] as number, m[19] as number]],
  ];
  return { passes: [{ shader, uniforms: () => uniforms }], css: () => css };
}
