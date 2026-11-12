import type { Backend, ExternalContext } from "./backend.js";
import { type Color, toRGBA } from "./color.js";
import type { Draw } from "./draw.js";

/** Options for `lines`, applied to every line. */
export interface LinesOptions {
  /** Line width in logical units, multiplied with `each.width`. Default 1. */
  width?: number | undefined;
  /** Colour multiplier for every line, multiplied with `each.color`. Default white. */
  color?: Color | undefined;
  /** Multiplied with the colour's alpha and `draw.alpha`. Default 1. */
  alpha?: number | undefined;
}

/** Optional per-line values for `lines`. Each array has one entry per line. */
export interface LinesEach {
  /** Width per line, multiplied with `options.width`. */
  width?: ArrayLike<number> | undefined;
  /** `0xRRGGBBAA` per line, multiplied with `options.color`. A `Uint32Array`, uploaded as is. */
  color?: Uint32Array | undefined;
}

/**
 * One instance per line, turned into a quad with the same algebra `line()` does on the CPU (translate to the start,
 * rotate along the line, scale to length × width), so the two land on the same pixels.
 */
const SHADER = {
  vertex: `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_seg;    // x1, y1, x2, y2
layout(location=2) in float a_width; // each.width
layout(location=3) in uint a_color;  // each.color, 0xRRGGBBAA
uniform vec2 u_view;
uniform vec4 u_linear;
uniform vec2 u_mt;
uniform float u_width;
uniform vec4 u_color;   // shared colour × alpha, straight
out vec4 v_color;
void main() {
  vec2 d = a_seg.zw - a_seg.xy;
  float len = length(d);
  float w = u_width * a_width;
  // A zero-length line has no direction: collapse it, as line() skips it.
  vec2 n = len > 0.0 ? vec2(-d.y, d.x) / len * w : vec2(0.0);
  mat2 M = mat2(u_linear.xy, u_linear.zw);
  vec2 a = M * (len > 0.0 ? d : vec2(0.0));
  vec2 c = M * n;
  vec2 e = M * (a_seg.xy - n * 0.5) + u_mt;
  vec2 p = a * a_corner.x + c * a_corner.y + e;
  vec2 clip = p / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vec4 each = vec4(float(a_color >> 24u), float((a_color >> 16u) & 255u), float((a_color >> 8u) & 255u), float(a_color & 255u)) / 255.0;
  vec4 col = u_color * each;
  v_color = vec4(spryte_toLinear(col.rgb) * col.a, col.a);
}`,
  fragment: `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}`,
};

/**
 * Many lines in one call: graph edges, grids, vector fields, trails. `segments` is x1, y1, x2, y2 per line. On
 * WebGL2 it's one draw call, and a `Float32Array` is uploaded as is, with no JavaScript work per line; the GPU
 * turns each line into a quad. Each line lands on the pixels `line()` draws with the same values. `options`
 * apply to every line; `each` adds a width or colour per line (multiplied with `options`).
 *
 * ```ts
 * import { lines } from "spryte";
 * lines(draw, edges, edgeCount, { color: "#ffffff20" });
 * lines(draw, edges, edgeCount, { width: 2 }, { color: edgeColors }); // edgeColors: Uint32Array of 0xRRGGBBAA
 * ```
 *
 * `count` is clamped to the shortest array; a `NaN` or negative count draws nothing. Zero-length lines draw
 * nothing. Custom shaders (`withShader`) don't apply on WebGL2. On the Canvas 2D fallback each line is drawn
 * with `draw.line()`. A separate import, like `polyline`, so apps that don't draw lines don't include it.
 * Since spryte 0.15.
 */
export function lines(draw: Draw, segments: ArrayLike<number>, count = segments.length >> 2, o: LinesOptions = {}, each?: LinesEach): void {
  const widths = each?.width;
  const colors = each?.color;
  let n = Math.min(Math.floor(count), segments.length >> 2);
  if (widths) n = Math.min(n, widths.length);
  if (colors) n = Math.min(n, colors.length);
  if (!(n > 0)) return;
  const width = o.width ?? 1;
  const color = draw.withAlpha(o.color === undefined ? 0xffffffff : toRGBA(o.color), o.alpha ?? 1);
  const backend = draw.backend;
  if (backend.external) {
    draw.quads += n;
    const m = draw.m;
    backend.external((gl, at) => {
      const p = pipeline(backend, gl, at);
      gl.useProgram(p.program);
      gl.bindVertexArray(p.vao);
      gl.uniform2f(p.view, at.width, at.height);
      gl.uniform4f(p.linear, m[0], m[1], m[2], m[3]);
      gl.uniform2f(p.mt, m[4], m[5]);
      gl.uniform1f(p.width, width);
      gl.uniform4f(p.color, (color >>> 24) / 255, ((color >>> 16) & 0xff) / 255, ((color >>> 8) & 0xff) / 255, (color & 0xff) / 255);
      upload(gl, p.segments, floats(segments, n * 4, p, "staging"), n * 4);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      if (widths) {
        upload(gl, p.widths, floats(widths, n, p, "stagingWidth"), n);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(2);
      } else {
        gl.disableVertexAttribArray(2);
        gl.vertexAttrib1f(2, 1);
      }
      if (colors) {
        upload(gl, p.colors, colors, n);
        gl.vertexAttribIPointer(3, 1, gl.UNSIGNED_INT, 0, 0);
        gl.enableVertexAttribArray(3);
      } else {
        gl.disableVertexAttribArray(3);
        gl.vertexAttribI4ui(3, 0xffffffff, 0, 0, 0);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    });
    return;
  }
  // The colour already carries draw.alpha; line() would apply it again.
  const alpha = draw.alpha;
  draw.alpha = 1;
  try {
    for (let i = 0; i < n; i++) {
      const s = i * 4;
      draw.line(
        segments[s] as number,
        segments[s + 1] as number,
        segments[s + 2] as number,
        segments[s + 3] as number,
        widths ? width * (widths[i] as number) : width,
        colors ? multiply(color, colors[i] as number) : color,
      );
    }
  } finally {
    draw.alpha = alpha;
  }
}

/** Channel-wise product of two 0xRRGGBBAA colours, as the GPU multiplies them. */
function multiply(x: number, y: number): number {
  const ch = (shift: number) => Math.round((((x >>> shift) & 0xff) * ((y >>> shift) & 0xff)) / 255);
  return ((ch(24) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

interface Pipeline {
  generation: number;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  segments: WebGLBuffer;
  widths: WebGLBuffer;
  colors: WebGLBuffer;
  view: WebGLUniformLocation | null;
  linear: WebGLUniformLocation | null;
  mt: WebGLUniformLocation | null;
  width: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  /** For arrays that aren't Float32Array: copied here, then uploaded. */
  staging: Float32Array;
  stagingWidth: Float32Array;
}

/** One program and its buffers per renderer, made on first use and again after a context restore. */
const pipelines = new WeakMap<Backend, Pipeline>();

function pipeline(backend: Backend, gl: WebGL2RenderingContext, at: ExternalContext): Pipeline {
  const had = pipelines.get(backend);
  if (had && had.generation === at.generation) return had;
  const program = at.link(SHADER.vertex, SHADER.fragment, "lines");
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  for (let loc = 1; loc <= 3; loc++) gl.vertexAttribDivisor(loc, 1);
  gl.enableVertexAttribArray(1);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const p: Pipeline = {
    generation: at.generation,
    program,
    vao,
    segments: gl.createBuffer(),
    widths: gl.createBuffer(),
    colors: gl.createBuffer(),
    view: u("u_view"),
    linear: u("u_linear"),
    mt: u("u_mt"),
    width: u("u_width"),
    color: u("u_color"),
    staging: new Float32Array(0),
    stagingWidth: new Float32Array(0),
  };
  pipelines.set(backend, p);
  at.release(() => {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    for (const b of [corners, p.segments, p.widths, p.colors]) gl.deleteBuffer(b);
    pipelines.delete(backend);
  });
  return p;
}

/** A Float32Array as is, anything else copied into the pipeline's staging array. */
function floats(data: ArrayLike<number>, length: number, p: Pipeline, key: "staging" | "stagingWidth"): Float32Array {
  if (data instanceof Float32Array) return data;
  if (p[key].length < length) p[key] = new Float32Array(length);
  const out = p[key];
  for (let i = 0; i < length; i++) out[i] = data[i] as number;
  return out;
}

function upload(gl: WebGL2RenderingContext, buffer: WebGLBuffer, data: Float32Array | Uint32Array, length: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW, 0, length);
}
