/**
 * Prototype WebGL2 sprite batcher: one instanced draw call per texture run.
 * Per-instance data: position, size, rotation, UV rect, and a packed RGBA tint.
 * Lives in the benchmark until ADR 0007 decides whether it becomes a package.
 */
const VERT = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_rect;      // x, y, w, h (centre-anchored)
layout(location=2) in float a_rotation;
layout(location=3) in vec4 a_uv;        // u0, v0, u1, v1
layout(location=4) in vec4 a_tint;      // normalised RGBA
uniform vec2 u_view;
out vec2 v_uv;
out vec4 v_tint;
void main() {
  vec2 local = (a_corner - 0.5) * a_rect.zw;
  float c = cos(a_rotation), s = sin(a_rotation);
  vec2 world = a_rect.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 clip = world / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
  v_tint = vec4(a_tint.rgb * a_tint.a, a_tint.a);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_tint;
uniform sampler2D u_tex;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv) * v_tint; }`;

/** Floats per instance: rect(4) + rotation(1) + uv(4); tint is 4 bytes appended. */
const FLOATS = 9;
const STRIDE = FLOATS * 4 + 4;

export class WebGLBatcher {
  readonly gl: WebGL2RenderingContext;
  private readonly capacity: number;
  private readonly data: ArrayBuffer;
  private readonly f32: Float32Array;
  private readonly u32: Uint32Array;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly viewLoc: WebGLUniformLocation | null;
  private count = 0;
  private texture: WebGLTexture | null = null;
  drawCalls = 0;

  constructor(canvas: HTMLCanvasElement, capacity = 16384) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.capacity = capacity;
    this.data = new ArrayBuffer(capacity * STRIDE);
    this.f32 = new Float32Array(this.data);
    this.u32 = new Uint32Array(this.data);

    const program = link(gl, VERT, FRAG);
    gl.useProgram(program);
    this.viewLoc = gl.getUniformLocation(program, "u_view");

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instances = gl.createBuffer();
    if (!instances) throw new Error("Could not create buffer");
    this.instanceBuffer = instances;
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const attr = (loc: number, size: number, type: number, normalised: boolean, offset: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, normalised, STRIDE, offset);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 4, gl.FLOAT, false, 0);
    attr(2, 1, gl.FLOAT, false, 16);
    attr(3, 4, gl.FLOAT, false, 20);
    attr(4, 4, gl.UNSIGNED_BYTE, true, 36);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  createTexture(source: TexImageSource, pixelArt = true): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("Could not create texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const filter = pixelArt ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  begin(width: number, height: number, clear: [number, number, number]): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(this.viewLoc, width, height);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawCalls = 0;
  }

  /** Queue one sprite. `tint` is 0xRRGGBBAA. */
  draw(
    texture: WebGLTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation = 0,
    u0 = 0,
    v0 = 0,
    u1 = 1,
    v1 = 1,
    tint = 0xffffffff,
  ): void {
    if (texture !== this.texture || this.count === this.capacity) {
      this.flush();
      this.texture = texture;
    }
    const f = this.count * (STRIDE / 4);
    const { f32 } = this;
    f32[f] = x;
    f32[f + 1] = y;
    f32[f + 2] = w;
    f32[f + 3] = h;
    f32[f + 4] = rotation;
    f32[f + 5] = u0;
    f32[f + 6] = v0;
    f32[f + 7] = u1;
    f32[f + 8] = v1;
    // Little-endian byte order: store as ABGR so the bytes read R,G,B,A.
    this.u32[f + 9] = ((tint & 0xff) << 24) | (((tint >>> 8) & 0xff) << 16) | (((tint >>> 16) & 0xff) << 8) | (tint >>> 24);
    this.count++;
  }

  flush(): void {
    if (this.count === 0 || !this.texture) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.count * (STRIDE / 4));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    this.drawCalls++;
    this.count = 0;
  }
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create shader");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader error");
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error");
  return program;
}
