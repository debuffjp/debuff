import { describe, expect, it } from "vitest";
import type { Matrix, TextureSource } from "../src/backend.js";
import { Draw } from "../src/draw.js";
import { blur, filter } from "../src/filters.js";
import { asData, byteToLinear, linearContexts } from "../src/linear.js";
import { mesh } from "../src/mesh.js";
import { Shader } from "../src/shader.js";
import { ring, roundRect } from "../src/shapes.js";
import { RenderTarget } from "../src/target.js";
import { WebGL2Backend } from "../src/webgl2.js";

/**
 * A recording stand-in for WebGL2: every method is logged, `create*` returns a fresh tagged object and
 * `delete*` marks it deleted, so tests can check uploads, batching and that nothing leaks.
 */
function fakeGL(active: { name: string; type: string; size?: number }[] = []) {
  const calls: { name: string; args: unknown[] }[] = [];
  const created: { kind: string; deleted: boolean }[] = [];
  const listeners = new Map<string, (e: Event) => void>();
  const canvas = {
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const shaderSources: string[] = [];
  const target: Record<string | symbol, unknown> = {
    canvas,
    drawingBufferWidth: 100,
    drawingBufferHeight: 50,
    getShaderParameter: () => true,
    // `active`: the uniforms every program reports, as a custom shader's would after the compiler dropped unused ones.
    getProgramParameter: (_p: unknown, key: string) => (key === "ACTIVE_UNIFORMS" ? active.length : true),
    getActiveUniform: (_p: unknown, i: number) => {
      const u = active[i];
      return u && { name: (u.size ?? 1) > 1 ? `${u.name}[0]` : u.name, type: u.type, size: u.size ?? 1 };
    },
    checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE",
    getParameter: (p: unknown) => (p === "MAX_TEXTURE_SIZE" ? 16384 : p === "MAX_TEXTURE_IMAGE_UNITS" ? 16 : undefined),
    // spryte's own uniforms and the active ones (or an element of one) have a location; removed ones don't.
    getUniformLocation: (_p: unknown, name: string) =>
      name.startsWith("u_") || active.some((u) => name === u.name || name.startsWith(`${u.name}[`)) ? { name } : null,
    shaderSource: (_s: unknown, src: string) => shaderSources.push(src),
  };
  const gl = new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (typeof key !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(key)) return key; // constants: their own name, readable in assertions
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
        if (key.startsWith("create")) {
          const obj = { kind: key.slice(6), deleted: false };
          created.push(obj);
          return obj;
        }
        if (key.startsWith("delete")) (args[0] as { deleted: boolean }).deleted = true;
        return undefined;
      };
    },
  });
  const fire = (type: string) => listeners.get(type)?.({ preventDefault() {} } as Event);
  const count = (name: string) => calls.filter((c) => c.name === name).length;
  return { gl: gl as unknown as WebGL2RenderingContext, calls, created, fire, count, shaderSources, listeners };
}

const M: Matrix = [16, 0, 0, 16, 0, 0];
const image = (w = 16, h = 16) => ({ width: w, height: h }) as unknown as TextureSource;

describe("WebGL2Backend", () => {
  it("uses highp texture coordinates so large atlases sample the right texel on mobile GPUs", () => {
    const { gl, shaderSources } = fakeGL();
    new WebGL2Backend(gl);
    expect(shaderSources[1]).toContain("in highp vec2 v_uv");
  });

  it("uploads a source once even when drawn both smooth and pixelated", () => {
    const { gl, count, calls } = fakeGL();
    const be = new WebGL2Backend(gl);
    const img = image();
    const uploadsBefore = count("texImage2D");
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, true);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    expect(count("texImage2D") - uploadsBefore).toBe(1);
    // One batch, two units: same texture, different samplers.
    expect(count("drawArraysInstanced")).toBe(1);
    const samplers = calls.filter((c) => c.name === "bindSampler").map((c) => c.args[0]);
    expect(samplers).toEqual([0, 1]);
  });

  it("builds mip levels only when asked, and samples them only for smooth draws of uploaded images", () => {
    const plain = fakeGL();
    const off = new WebGL2Backend(plain.gl);
    off.begin(0x000000ff, 100, 50, 1);
    off.quad(M, image(), 0, 0, 16, 16, 0xffffffff, 0, true);
    off.end();
    expect(plain.count("generateMipmap")).toBe(0);

    const { gl, calls, created, count } = fakeGL();
    const be = new WebGL2Backend(gl, true);
    const [nearest, linear, trilinear] = created.filter((o) => o.kind === "Sampler");
    const img = image();
    const target = new RenderTarget(8, 8);
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, true);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    // A render target has no mip levels: trilinear sampling would make it incomplete (black).
    be.quad(M, target, 0, 0, 8, 8, 0xffffffff, 0, true);
    be.end();
    expect(count("generateMipmap")).toBe(1);
    const bound = calls.filter((c) => c.name === "bindSampler").map((c) => c.args[1]);
    expect(bound).toEqual([trilinear, nearest, linear]);
  });

  it("draws a mesh as indexed triangles in the shape batch, with uvs offset into an atlas frame", () => {
    const { gl, calls, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    const draw = new Draw(be, true);
    const atlas = image(64, 32);
    draw.begin("#000", 100, 50, 1);
    mesh(draw, { image: atlas, x: 32, y: 0, w: 32, h: 32 }, [0, 0, 10, 0, 0, 10, 10, 10], [0, 0, 32, 0, 0, 32, 32, 32], [0, 1, 2, 1, 3, 2]);
    // A sprite after a mesh joins its batch.
    draw.sprite(atlas, 50, 25);
    draw.end();
    expect(count("drawElements")).toBe(1);
    expect(count("drawArraysInstanced")).toBe(0);
    const uploads = calls.filter((c) => c.name === "bufferData");
    const indices = uploads.at(-1)?.args[1] as Uint32Array;
    expect([...indices.subarray(0, 6)]).toEqual([0, 1, 2, 1, 3, 2]);
    const verts = uploads.at(-2)?.args[1] as Float32Array;
    // Vertex 3: position (10, 10), uv at the frame's bottom-right: (32 + 32) / 64, 32 / 32.
    expect([...verts.subarray(18, 22)]).toEqual([10, 10, 1, 1]);
    // Vertex 0: the frame's top-left is halfway across the atlas.
    expect([...verts.subarray(0, 4)]).toEqual([0, 0, 0.5, 0]);
  });

  it("rejects mesh indices outside the vertices", () => {
    const { gl } = fakeGL();
    const draw = new Draw(new WebGL2Backend(gl), true);
    draw.begin("#000", 100, 50, 1);
    expect(() => mesh(draw, image(), [0, 0, 1, 0, 0, 1], [0, 0, 1, 0, 0, 1], [0, 1, 3])).toThrow(/out of range/);
  });

  it("splits batches when more than 8 textures are in flight, and counts draw calls", () => {
    const { gl, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    be.begin(0x000000ff, 100, 50, 1);
    for (let i = 0; i < 9; i++) be.quad(M, image(), 0, 0, 16, 16, 0xffffffff, 0, false);
    expect(be.drawCalls).toBe(2);
    be.end();
    expect(count("drawArraysInstanced")).toBe(2);
  });

  it("skips drawing while the context is lost and re-uploads after restore", () => {
    const { gl, count, fire } = fakeGL();
    const be = new WebGL2Backend(gl);
    const img = image();
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    fire("webglcontextlost");
    expect(be.contextLost).toBe(true);
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    expect(count("drawArraysInstanced")).toBe(1);
    const uploads = count("texImage2D");
    fire("webglcontextrestored");
    expect(be.contextLost).toBe(false);
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    // Restore recreates the white texture and re-uploads the source on first use.
    expect(count("texImage2D") - uploads).toBe(2);
    expect(count("drawArraysInstanced")).toBe(2);
  });

  it("dispose() deletes every GPU object it created and removes its listeners", () => {
    const { gl, created, listeners } = fakeGL();
    const be = new WebGL2Backend(gl);
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, image(), 0, 0, 16, 16, 0xffffffff, 0, true);
    be.end();
    be.dispose();
    expect(created.filter((o) => !o.deleted).map((o) => o.kind)).toEqual([]);
    expect(listeners.size).toBe(0);
  });

  it("uploads an image again once it has loaded, instead of keeping the empty upload", () => {
    const { gl, count } = fakeGL();
    const draw = new Draw(new WebGL2Backend(gl), false);
    draw.begin("#000", 100, 50, 1);
    const img = { naturalWidth: 0, naturalHeight: 0 } as unknown as HTMLImageElement;
    draw.sprite(img, 0, 0);
    draw.end();
    img.naturalWidth = 16;
    img.naturalHeight = 16;
    draw.begin("#000", 100, 50, 1);
    draw.sprite(img, 0, 0);
    draw.end();
    // The white placeholder plus the loaded image: no empty upload. Before spryte 0.12.4 this was 1, because the
    // one-entry texture cache kept the placeholder for the image and the real pixels were never uploaded.
    expect(count("texImage2D")).toBe(2);
  });

  it("drops what a frame that never reached end() left in its batch", () => {
    const { gl, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, image(), 0, 0, 16, 16, 0xffffffff, 0, false); // then the game threw before end()
    be.begin(0x000000ff, 100, 50, 1);
    be.end();
    expect(count("drawArraysInstanced")).toBe(0); // the stale quad isn't drawn over the new frame
  });

  it("doesn't keep drawing an image as the white placeholder after it loads", () => {
    const { gl, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    const img = { naturalWidth: 0, naturalHeight: 0 } as unknown as HTMLImageElement;
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false); // still loading: drawn with the 1×1 white
    be.end();
    const before = count("texImage2D");
    img.naturalWidth = 16;
    img.naturalHeight = 16;
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    expect(count("texImage2D")).toBe(before + 1); // the loaded image is uploaded and used
  });

  it("invalidate() re-uploads changed pixels", () => {
    const { gl, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    const img = image();
    be.begin(0x000000ff, 100, 50, 1);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.invalidate(img);
    be.quad(M, img, 0, 0, 16, 16, 0xffffffff, 0, false);
    be.end();
    expect(count("texImage2D")).toBe(3); // white + two uploads
  });

  it("scissors in bottom-left coordinates", () => {
    const { gl, calls } = fakeGL();
    const be = new WebGL2Backend(gl);
    be.setClip({ x: 10, y: 5, w: 20, h: 10 });
    expect(calls.find((c) => c.name === "scissor")?.args).toEqual([10, 35, 20, 10]);
  });

  it("sprites() draws after queued quads in one call, uploading a Float32Array as is", () => {
    const { gl, calls } = fakeGL();
    const draw = new Draw(new WebGL2Backend(gl), false);
    const img = image(8, 8);
    const pos = new Float32Array([1, 2, 3, 4, 5, 6]);
    calls.length = 0;
    draw.begin("#000", 100, 50, 1);
    draw.rect(0, 0, 1, 1, "#fff");
    draw.sprites(img, pos, 3, { tint: "#ff0000" });
    draw.rect(0, 0, 1, 1, "#fff");
    draw.end();
    const names = calls.map((c) => c.name).filter((n) => n === "drawArraysInstanced" || n === "useProgram");
    // queued rect, switch to the copy program, copies, back to the sprite program, last rect
    expect(names).toEqual(["drawArraysInstanced", "useProgram", "drawArraysInstanced", "useProgram", "drawArraysInstanced"]);
    const copies = calls.filter((c) => c.name === "drawArraysInstanced")[1];
    expect(copies?.args[3]).toBe(3);
    const upload = calls.find((c) => c.name === "bufferData" && c.args[1] === pos);
    expect(upload?.args.slice(3)).toEqual([0, 6]);
    const color = calls.find((c) => c.name === "uniform4f" && c.args[1] === 1 && c.args[2] === 0);
    expect(color).toBeDefined();
    expect(draw.drawCalls).toBe(3);
  });

  it("sprites() copies plain arrays through a staging buffer", () => {
    const { gl, calls } = fakeGL();
    const draw = new Draw(new WebGL2Backend(gl), false);
    draw.begin("#000", 100, 50, 1);
    draw.sprites(image(), [1, 2, 3, 4]);
    const upload = calls.findLast((c) => c.name === "bufferData") as { args: unknown[] };
    expect(Array.from((upload.args[1] as Float32Array).subarray(0, 4))).toEqual([1, 2, 3, 4]);
    expect(draw.drawCalls).toBe(1);
    draw.end();
  });

  describe("sprites", () => {
    const sprite = (calls: { name: string; args: unknown[] }[], i = 0) => {
      const f = calls.findLast((c) => c.name === "bufferSubData")?.args[2] as Float32Array;
      return Array.from(f.subarray(i * 14, i * 14 + 13));
    };

    it("share one batch with quads (rects, text) drawn between them", () => {
      const { gl, count } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const img = image();
      draw.begin("#000", 100, 50, 1);
      for (let i = 0; i < 10; i++) {
        draw.sprite(img, i * 10, 10, { rotation: 0.5 });
        draw.rect(i * 10, 30, 8, 2, "#f00");
      }
      draw.end();
      expect(count("drawArraysInstanced")).toBe(1);
    });

    it("stay in the batch under a transform that changes per sprite, sent as finished quads", () => {
      const { gl, calls, count } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const img = image();
      draw.begin("#000", 100, 50, 1);
      for (let i = 0; i < 3; i++) {
        draw.push();
        draw.translate(i * 20, 0);
        draw.sprite(img, 10, 10, { rotation: 0.5 });
        draw.pop();
      }
      draw.end();
      expect(count("drawArraysInstanced")).toBe(1);
      // The first sets the batch's transform; the others are quads (no sprite flag) with the same corners.
      expect(sprite(calls, 0)[12]).toBeGreaterThanOrEqual(16);
      expect(sprite(calls, 1)[12]).toBeLessThan(16);
    });

    it("keep their texture and order around shapes under a custom shader, which shapes can't batch with", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const identity = new Shader("vec4 effect(vec4 color, vec2 uv) { return source(uv) * color; }");
      draw.begin("#000", 100, 50, 1);
      draw.withShader(identity, () => {
        roundRect(draw, 0, 0, 20, 20, 4, "#e23");
        draw.sprite(image(), 10, 10, { rotation: 0.5 });
        ring(draw, 10, 10, 5, 1, "#ffd36b");
      });
      draw.end();
      const draws = calls.filter((c) => c.name === "drawElements" || c.name === "drawArraysInstanced").map((c) => c.name);
      expect(draws).toEqual(["drawElements", "drawArraysInstanced", "drawElements"]);
      // Flushing the shapes frees their texture units; the sprite's unit must outlive that.
      const info = calls.findLast((c) => c.name === "uniform3fv")?.args[1] as Float32Array;
      expect(info[0]).toBe(1 / 16);
    });

    it("give a custom shader frameUv() in every program it compiles into", () => {
      const { gl, shaderSources } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const local = new Shader("vec4 effect(vec4 color, vec2 uv) { return vec4(frameUv(), 0.0, 1.0); }");
      draw.begin("#000", 100, 50, 1);
      draw.withShader(local, () => {
        draw.sprite(image(), 10, 10);
        draw.sprites(image(), new Float32Array([1, 2, 3, 4]), 2);
        roundRect(draw, 0, 0, 20, 20, 4, "#e23");
      });
      draw.end();
      // Sources arrive as vertex, fragment pairs. A fragment that reads v_local needs a vertex stage that writes it.
      for (let i = 0; i < shaderSources.length; i += 2) {
        if (!shaderSources[i + 1]?.includes("in highp vec2 v_local")) continue;
        expect(shaderSources[i]).toMatch(/out highp vec2 v_local;[\s\S]*v_local = /);
      }
      expect(shaderSources.filter((s) => s.includes("frameUv()")).length).toBeGreaterThanOrEqual(2);
    });

    it("run a custom shader on a rect with uv and frameUv() across it, and leave vector shapes to the built-in effect", () => {
      const { gl, calls, shaderSources } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const effect = "vec4 effect(vec4 color, vec2 uv) { return color * distance(frameUv(), vec2(0.5)); }";
      const vignette = new Shader(effect);
      draw.begin("#000", 100, 50, 1);
      draw.withShader(vignette, () => draw.rect(0, 0, 100, 50, "#000"));
      draw.end();
      // A rect is a quad over the 1x1 white texture: uv runs (0, 0) to (1, 1) across it, not (0, 0).
      const quad = sprite(calls, 0);
      expect(quad[12]).toBeLessThan(16);
      expect(quad.slice(6, 10)).toEqual([0, 0, 1, 1]);
      draw.begin("#000", 100, 50, 1);
      draw.withShader(vignette, () => roundRect(draw, 0, 0, 100, 50, 4, "#000"));
      draw.end();
      // Sources arrive as vertex, fragment pairs.
      const pairs = Array.from({ length: shaderSources.length / 2 }, (_, i) => [shaderSources[i * 2], shaderSources[i * 2 + 1]]);
      // The rect's program runs the effect, with frameUv() from the quad's corner.
      const custom = pairs.filter(([, fs]) => fs?.includes(effect));
      expect(custom).toHaveLength(1);
      expect(custom[0]?.[0]).toContain("v_local = a_corner;");
      // Vector shapes have their own program, built with the built-in effect only.
      const shape = pairs.filter(([vs]) => vs?.includes("a_posuv"));
      expect(shape).toHaveLength(1);
      expect(shape[0]?.[1]).not.toContain(effect);
    });

    it("write the same instance on the short path as on the full one", () => {
      const run = (warm: boolean) => {
        const { gl, calls } = fakeGL();
        const draw = new Draw(new WebGL2Backend(gl), true);
        const img = image();
        draw.begin("#000", 100, 50, 1);
        // The first sprite opens the batch on the full path; the second takes the short one.
        if (warm) draw.sprite(img, 1, 1);
        draw.sprite(img, 10.4, 10.6, { rotation: 1, scaleX: 2, origin: [0, 1], flash: 0.5, tint: 0x80ff40ff });
        draw.end();
        return sprite(calls, warm ? 1 : 0);
      };
      expect(run(true)).toEqual(run(false));
    });

    it("move with a translate() between two sprites, without push or pop", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      const img = image();
      draw.begin("#000", 100, 50, 1);
      draw.sprite(img, 10, 10);
      draw.translate(20, 0);
      draw.sprite(img, 10, 10);
      draw.end();
      // The first is a placed sprite at 10 - 8 = 2. The second, under a new transform, is a quad (no sprite flag)
      // whose translation is 22: the transform change was seen.
      const second = sprite(calls, 1);
      expect([sprite(calls, 0)[0], second[2], second[12]]).toEqual([2, 22, 0]);
    });

    it("find a texture unit that a quad assigned", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), true);
      const a = image();
      const b = image(32, 32);
      draw.begin("#000", 100, 50, 1);
      draw.sprite(a, 10, 10, { rotation: 0.5 });
      draw.push();
      draw.translate(5, 0);
      draw.sprite(b, 10, 10, { rotation: 0.5 }); // another transform: a quad, which gives b unit 1
      draw.pop();
      draw.sprite(b, 10, 10, { rotation: 0.5 }); // the short path must use b's unit, not a's
      draw.end();
      expect(sprite(calls, 2)[12]).toBe(1 + 16);
    });

    it("land unrotated pixel art on whole pixels, rounded on the CPU", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      draw.translate(0.3, 0);
      draw.sprite(image(), 10.4, 10.6);
      draw.end();
      // Anchored at its centre: 0.3 + 10.4 - 8 = 2.7 → 3, and 10.6 - 8 = 2.6 → 3. Flags: unit 0 + sprite + placed.
      const f = sprite(calls);
      expect([f[0], f[1], f[12]]).toEqual([3, 3, 48]);
    });

    it("keep their own position for the GPU when rotated or smooth", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), true);
      draw.begin("#000", 100, 50, 1);
      draw.sprite(image(), 10.4, 10.6, { rotation: 1, scaleX: 2, origin: [0, 1] });
      draw.end();
      expect(sprite(calls).map((v) => Math.round(v * 1000) / 1000)).toEqual([10.4, 10.6, 1, 2, 1, 0, 1, 0, 0, 0, 16, 16, 16]);
    });
  });

  describe("custom shader uniforms", () => {
    const POOL = "uniform vec4 pool[4]; uniform sampler2D noise; vec4 effect(vec4 color, vec2 uv) { return pool[0] * texture(noise, uv); }";
    const uploads = (calls: { name: string; args: unknown[] }[], fn: string) =>
      calls.filter((c) => c.name === fn).map((c) => [(c.args[0] as { name: string }).name, ...c.args.slice(1)]);

    it("set a vec4 array with uniform4fv and a float array with uniform1fv, from the active uniform's type", () => {
      const { gl, calls } = fakeGL([
        { name: "pool", type: "FLOAT_VEC4", size: 4 },
        { name: "weights", type: "FLOAT", size: 4 },
        { name: "offset", type: "FLOAT_VEC2" },
      ]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const fx = new Shader(POOL);
      const pool = new Float32Array(16).fill(0.5);
      // 4 numbers on a float[4] is an array, not a vec4.
      fx.set("pool", pool).set("weights", [1, 2, 3, 4]).set("offset", [3, 4]);
      draw.begin("#000", 100, 50, 1);
      draw.withShader(fx, () => draw.rect(0, 0, 10, 10, "#fff"));
      draw.end();
      expect(uploads(calls, "uniform4fv")).toEqual([["pool", pool]]);
      expect(uploads(calls, "uniform1fv")).toEqual([["weights", [1, 2, 3, 4]]]);
      // Tuples on plain vectors keep their old call.
      expect(uploads(calls, "uniform2f")).toContainEqual(["offset", 3, 4]);
    });

    it("keep the batch when set() repeats the current value, and flush when it changes or the same array comes back", () => {
      const { gl } = fakeGL([
        { name: "time", type: "FLOAT" },
        { name: "tint", type: "FLOAT_VEC3" },
        { name: "pool", type: "FLOAT_VEC4", size: 4 },
      ]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const fx = new Shader("uniform float time; uniform vec3 tint; uniform vec4 pool[4]; vec4 effect(vec4 c, vec2 uv) { return c; }");
      const pool = new Float32Array(16);
      fx.set("time", 1).set("tint", [1, 0, 0]).set("pool", pool);
      const run = (fn: () => void) => {
        draw.begin("#000", 100, 50, 1);
        draw.withShader(fx, () => {
          draw.rect(0, 0, 1, 1, "#fff");
          fn();
          draw.rect(0, 0, 1, 1, "#fff");
        });
        draw.end();
        return draw.drawCalls;
      };
      expect(run(() => fx.set("time", 1).set("tint", [1, 0, 0]).set("pool", new Float32Array(16)))).toBe(1);
      expect(run(() => fx.set("time", 2))).toBe(2);
      expect(run(() => fx.set("tint", [0, 1, 0]))).toBe(2);
      // The array is read when the batch draws, so setting the same object again must flush: its contents may have changed.
      expect(run(() => fx.set("pool", fx.uniforms.get("pool") as Float32Array))).toBe(2);
    });

    it("throw an error naming the uniform when an array's length doesn't fit its type", () => {
      for (const n of [10, 20, 0]) {
        const { gl } = fakeGL([{ name: "pool", type: "FLOAT_VEC4", size: 4 }]);
        const draw = new Draw(new WebGL2Backend(gl), false);
        const fx = new Shader(POOL).set("pool", new Float32Array(n));
        draw.begin("#000", 100, 50, 1);
        // Checked when the shader is first used, before anything changes.
        expect(() => draw.withShader(fx, () => draw.rect(0, 0, 10, 10, "#fff"))).toThrow(
          new RegExp(`uniform \`pool\` is vec4\\[4\\]: set\\(\\) got ${n} numbers`),
        );
        expect(draw.shader).toBe(null);
        expect(() => draw.end()).not.toThrow();
      }
    });

    it("check a value set while the shader draws at the set() call, keeping the old value and the queued draws", () => {
      const { gl, calls } = fakeGL([{ name: "pool", type: "FLOAT_VEC4", size: 4 }]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const good = new Float32Array(16);
      const fx = new Shader(POOL).set("pool", good);
      draw.begin("#000", 100, 50, 1);
      let error = "";
      draw.withShader(fx, () => {
        draw.rect(0, 0, 10, 10, "#fff");
        try {
          fx.set("pool", [1, 2, 3]);
        } catch (e) {
          error = String(e);
        }
        draw.rect(20, 0, 10, 10, "#fff");
      });
      draw.end();
      expect(error).toMatch(/uniform `pool` is vec4\[4\]: set\(\) got 3 numbers/);
      expect(fx.uniforms.get("pool")).toBe(good);
      // Both rects in one batch, drawn with the good value.
      expect(calls.filter((c) => c.name === "drawArraysInstanced")).toHaveLength(1);
      expect(uploads(calls, "uniform4fv")).toEqual([["pool", good]]);
    });

    it("still set one element of an array by its name, as before 0.13", () => {
      const { gl, calls } = fakeGL([{ name: "pool", type: "FLOAT_VEC4", size: 4 }]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const fx = new Shader(POOL).set("pool[2]", [1, 0, 0, 1]);
      draw.begin("#000", 100, 50, 1);
      draw.withShader(fx, () => draw.rect(0, 0, 10, 10, "#fff"));
      draw.end();
      expect(uploads(calls, "uniform4fv")).toEqual([["pool[2]", [1, 0, 0, 1]]]);
      // Past the end of the array, from that element: two vec4s fit after pool[2], three don't.
      expect(() => fx.set("pool[2]", new Float32Array(12))).not.toThrow();
      expect(() => draw.withShader(fx, () => {})).toThrow(/uniform `pool\[2\]` is vec4\[2\]: set\(\) got 12 numbers/);
    });

    it("ignore arrays and textures set on uniforms the compiler removed", () => {
      const { gl, calls } = fakeGL([]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const fx = new Shader(POOL).set("pool", new Float32Array(3)).set("noise", image()).set("gone", 1);
      draw.begin("#000", 100, 50, 1);
      expect(() => {
        draw.withShader(fx, () => draw.rect(0, 0, 10, 10, "#fff"));
        draw.end();
      }).not.toThrow();
      expect(calls.some((c) => c.name.startsWith("uniform") && (c.args[0] as { name?: string })?.name === "pool")).toBe(false);
      expect(calls.some((c) => c.name === "bindSampler" && c.args[0] === 8)).toBe(false);
    });

    it("bind a sampler2D texture past the sprite units, on every flush, before the batch's own units", () => {
      const { gl, calls, created } = fakeGL([{ name: "noise", type: "SAMPLER_2D" }]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const [nearest, linear] = created.filter((o) => o.kind === "Sampler");
      const noise = image(4, 4);
      const fx = new Shader(POOL).set("noise", noise);
      const hero = image();
      draw.begin("#000", 100, 50, 1);
      draw.withShader(fx, () => {
        draw.sprite(hero, 10, 10);
        // Shapes can't join a custom shader's batch: this ends the first one.
        roundRect(draw, 0, 0, 4, 4, 1, "#fff");
        draw.sprite(hero, 20, 10);
      });
      draw.end();
      // The sampler points at unit 8: units 0 to 7 hold the batch's sprites.
      expect(uploads(calls, "uniform1i")).toContainEqual(["noise", 8]);
      const binds = calls.filter((c) => c.name === "bindSampler" && c.args[0] === 8);
      expect(binds.map((c) => c.args[1])).toEqual([nearest, nearest]);
      // Uploading the shader's texture goes through unit 0, so the sprite's unit 0 is bound after it.
      const order = calls.map((c) => (c.name === "activeTexture" ? `${c.name}:${c.args[0]}` : c.name));
      const upload = calls.findIndex((c) => c.name === "texImage2D" && c.args.includes(noise));
      // (The fake's constants are strings: unit i of a batch is "TEXTURE0" + i.)
      expect(upload).toBeGreaterThan(0);
      expect(order.indexOf("activeTexture:TEXTURE00", upload)).toBeLessThan(order.indexOf("drawArraysInstanced", upload));
      expect(order.lastIndexOf("activeTexture:TEXTURE08")).toBeLessThan(order.lastIndexOf("activeTexture:TEXTURE00"));

      // smooth: linear filtering.
      const smooth = fakeGL([{ name: "noise", type: "SAMPLER_2D" }]);
      const d2 = new Draw(new WebGL2Backend(smooth.gl), false);
      const lin = smooth.created.filter((o) => o.kind === "Sampler")[1];
      d2.begin("#000", 100, 50, 1);
      d2.withShader(new Shader(POOL).set("noise", image(4, 4), { smooth: true }), () => d2.rect(0, 0, 1, 1, "#fff"));
      d2.end();
      expect(smooth.calls.filter((c) => c.name === "bindSampler" && c.args[0] === 8).map((c) => c.args[1])).toEqual([lin]);
      expect(linear).toBeDefined();
    });

    it("reach the per-copy program draw.sprites uses, which has its own uniform table", () => {
      const { gl, calls } = fakeGL([
        { name: "pool", type: "FLOAT_VEC4", size: 4 },
        { name: "noise", type: "SAMPLER_2D" },
      ]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const pool = new Float32Array(8);
      const fx = new Shader(POOL).set("pool", pool).set("noise", image(4, 4));
      draw.begin("#000", 100, 50, 1);
      draw.withShader(fx, () => draw.sprites(image(), new Float32Array([1, 2, 3, 4]), 2));
      draw.end();
      expect(uploads(calls, "uniform4fv")).toEqual([["pool", pool]]);
      expect(calls.filter((c) => c.name === "bindSampler" && c.args[0] === 8)).toHaveLength(1);
      expect(calls.filter((c) => c.name === "drawArraysInstanced")).toHaveLength(1);
    });

    it("take a render target as a texture, but not the one being drawn into", () => {
      const { gl } = fakeGL([{ name: "noise", type: "SAMPLER_2D" }]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const rt = new RenderTarget(8, 8);
      const fx = new Shader(POOL).set("noise", rt);
      draw.begin("#000", 100, 50, 1);
      // Drawing to the screen with the target as a texture is fine.
      draw.withShader(fx, () => draw.rect(0, 0, 10, 10, "#fff"));
      expect(() => draw.into(rt, () => draw.rect(0, 0, 4, 4, "#fff"))).not.toThrow();
      const feedback = /shader texture `noise` is the render target being drawn into/;
      // Each way in throws before it changes anything: the shader inside the target, the target inside the shader,
      // and set() while drawing into it.
      expect(() => draw.into(rt, () => draw.withShader(fx, () => draw.rect(0, 0, 4, 4, "#fff")))).toThrow(feedback);
      expect(() => draw.withShader(fx, () => draw.into(rt, () => draw.rect(0, 0, 4, 4, "#fff")))).toThrow(feedback);
      const other = new Shader(POOL);
      expect(() => draw.into(rt, () => draw.withShader(other, () => other.set("noise", rt)))).toThrow(feedback);
      expect(other.textures.size).toBe(0);
      expect(draw.shader).toBe(null);
      expect(() => draw.end()).not.toThrow();
    });

    it("refuse more textures than the GPU has units past spryte's own, when the shader is first used", () => {
      const many = Array.from({ length: 9 }, (_, i) => ({ name: `t${i}`, type: "SAMPLER_2D" }));
      const { gl } = fakeGL(many);
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      expect(() => draw.withShader(new Shader(POOL), () => {})).toThrow(/texture `t8` needs unit 16, past this GPU's 16/);
      expect(() => draw.end()).not.toThrow();
    });

    it("throw when an array goes on a sampler or a texture on a float", () => {
      const { gl } = fakeGL([
        { name: "noise", type: "SAMPLER_2D" },
        { name: "pool", type: "FLOAT_VEC4", size: 4 },
      ]);
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      const wrong = new Shader(POOL).set("pool", image());
      expect(() => draw.withShader(wrong, () => draw.rect(0, 0, 1, 1, "#fff"))).toThrow(/uniform `pool` isn't a sampler2D/);
      const arrayOnSampler = new Shader(POOL).set("noise", new Float32Array(4));
      expect(() => draw.withShader(arrayOnSampler, () => {})).toThrow(/uniform `noise` isn't a float, vec2, vec3 or vec4/);
      expect(() => draw.end()).not.toThrow();
    });
  });

  describe("render targets", () => {
    it("allocates half floats for rgba16f where the GPU can render to them", () => {
      const { gl, calls } = fakeGL();
      (gl as unknown as Record<string, unknown>).getExtension = (name: string) => (name === "EXT_color_buffer_float" ? {} : null);
      const draw = new Draw(new WebGL2Backend(gl), false);
      const t = draw.createTarget(8, 4, { format: "rgba16f" });
      expect(t.format).toBe("rgba16f");
      expect(draw.supportsTarget("rgba16f")).toBe(true);
      calls.length = 0;
      draw.begin("#000", 100, 50, 1);
      draw.into(t, () => {});
      draw.end();
      const upload = calls.find((c) => c.name === "texImage2D");
      expect(upload?.args[2]).toBe("RGBA16F");
      expect(upload?.args[7]).toBe("HALF_FLOAT");
    });

    it("falls back to rgba8 when neither float extension is there", () => {
      const { gl, calls } = fakeGL();
      (gl as unknown as Record<string, unknown>).getExtension = () => null;
      const draw = new Draw(new WebGL2Backend(gl), false);
      const t = draw.createTarget(8, 4, { format: "rgba16f" });
      expect(t.format).toBe("rgba8");
      expect(draw.supportsTarget("rgba16f")).toBe(false);
      draw.begin("#000", 100, 50, 1);
      draw.into(t, () => {});
      draw.end();
      expect(calls.find((c) => c.name === "texImage2D")?.args[7]).toBe("UNSIGNED_BYTE");
    });

    it("draws into a framebuffer at the target's size and switches back to the canvas", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 50, 25, 2);
      const t = draw.createTarget(32, 16);
      calls.length = 0;
      draw.into(t, () => draw.rect(0, 0, 4, 4, "#fff"));
      draw.rect(0, 0, 4, 4, "#fff");
      draw.end();
      const binds = calls.filter((c) => c.name === "bindFramebuffer").map((c) => c.args[1] !== null);
      expect(binds.at(0)).toBe(true);
      expect(binds.at(-1)).toBe(false);
      const viewports = calls.filter((c) => c.name === "viewport").map((c) => c.args);
      expect(viewports).toEqual([
        [0, 0, 32, 16],
        [0, 0, 100, 50],
      ]);
      const views = calls.filter((c) => c.name === "uniform2f").map((c) => c.args.slice(1));
      expect(views).toEqual([
        [32, 16],
        [50, 25],
      ]);
    });

    it("samples targets upside down, since WebGL stores them bottom row first", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      const t = draw.createTarget(10, 10);
      draw.into(t, () => {});
      draw.sprite(t, 5, 5);
      draw.end();
      // Sprites read each unit's texture size and top-row v from u_texinfo: v starts at 1 and runs down.
      const info = calls.findLast((c) => c.name === "uniform3fv")?.args[1] as Float32Array;
      expect([info[0], info[1], info[2]]).toEqual([0.1, -0.1, 1].map(Math.fround));
    });

    it("refuses to draw a target into itself, or dispose it while drawing into it", () => {
      const { gl } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      const t = draw.createTarget(10, 10);
      expect(() => draw.into(t, () => draw.sprite(t, 0, 0))).toThrow(/into itself/);
      expect(() => draw.into(t, () => draw.sprites(t, [0, 0]))).toThrow(/into itself/);
      expect(() => draw.into(t, () => draw.disposeTarget(t))).toThrow(/while drawing into it/);
      // After a throw inside into(), drawing is back on the canvas.
      expect(() => draw.sprite(t, 0, 0)).not.toThrow();
      draw.end();
    });

    it("premultiplies a see-through clear colour, like begin()", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      draw.into(draw.createTarget(10, 10), () => {}, "#ff000080");
      const a = 0x80 / 255;
      expect(calls.findLast((c) => c.name === "clearColor")?.args).toEqual([a, 0, 0, a]);
      draw.end();
    });

    it("leaves Draw's state as it was when the target can't be created", () => {
      const { gl } = fakeGL();
      (gl as unknown as { checkFramebufferStatus: () => string }).checkFramebufferStatus = () => "FRAMEBUFFER_UNSUPPORTED";
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 2);
      draw.translate(5, 5);
      draw.alpha = 0.5;
      draw.clip(0, 0, 10, 10, () => {
        expect(() => draw.into(draw.createTarget(10, 10), () => {})).toThrow(/could not be created/);
        expect(draw.clips).toHaveLength(1);
      });
      expect(draw.m).toEqual([1, 0, 0, 1, 5, 5]);
      expect(draw.alpha).toBe(0.5);
      expect(draw.renderScale).toBe(2);
      expect(draw.target).toBeNull();
      expect(() => draw.pop()).toThrow(/without a matching push/);
      draw.end();
    });

    it("clears a filter's first pass in full even inside a clip", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      draw.clip(10, 10, 20, 20, () => filter(draw, [blur(2)], () => draw.rect(0, 0, 50, 50, "#fff")));
      const names = calls.map((c) => `${c.name}:${String(c.args[0])}`);
      const firstClear = names.indexOf("clear:COLOR_BUFFER_BIT", names.indexOf("enable:SCISSOR_TEST"));
      expect(names.lastIndexOf("disable:SCISSOR_TEST", firstClear)).toBeGreaterThan(names.indexOf("enable:SCISSOR_TEST"));
      draw.end();
    });

    it("clips inside a target flip against the target's height", () => {
      const { gl, calls } = fakeGL();
      const draw = new Draw(new WebGL2Backend(gl), false);
      draw.begin("#000", 100, 50, 1);
      draw.into(draw.createTarget(40, 20), () => draw.clip(0, 0, 10, 5, () => draw.rect(0, 0, 1, 1, "#fff")));
      expect(calls.find((c) => c.name === "scissor")?.args).toEqual([0, 15, 10, 5]);
      draw.end();
    });

    it("frees framebuffers on disposeTarget and dispose, and recreates targets blank after context loss", () => {
      const { gl, created, fire, count } = fakeGL();
      const backend = new WebGL2Backend(gl);
      const draw = new Draw(backend, false);
      draw.begin("#000", 100, 50, 1);
      const a = draw.createTarget(8, 8);
      const b = draw.createTarget(8, 8);
      draw.into(a, () => {});
      draw.into(b, () => {});
      draw.disposeTarget(a);
      const fbos = () => created.filter((o) => o.kind === "Framebuffer");
      expect(fbos().map((o) => o.deleted)).toEqual([true, false]);
      fire("webglcontextlost");
      const restoredFrom = created.length;
      fire("webglcontextrestored");
      const before = count("createFramebuffer");
      draw.begin("#000", 100, 50, 1);
      draw.into(b, () => {});
      expect(count("createFramebuffer")).toBe(before + 1);
      draw.end();
      draw.dispose();
      // Objects from before the loss died with that context; everything made since is freed.
      expect(created.slice(restoredFrom).filter((o) => !o.deleted)).toEqual([]);
    });
  });
});

describe("blendSpace linear", () => {
  const linearGL = () => {
    const f = fakeGL();
    linearContexts.add(f.gl);
    return f;
  };

  it("defines SPRYTE_LINEAR only on linear contexts, and gives every shader spryte_toLinear", () => {
    const plain = fakeGL();
    new WebGL2Backend(plain.gl);
    expect(plain.shaderSources.every((s) => s.includes("spryte_toLinear") && !s.includes("SPRYTE_LINEAR 1"))).toBe(true);
    const lin = linearGL();
    new WebGL2Backend(lin.gl);
    expect(lin.shaderSources.every((s) => /^#version 300 es\n#define SPRYTE_LINEAR 1\n/.test(s))).toBe(true);
  });

  it("stores colour images and targets as sRGB, data images raw, and copies to the canvas at end()", () => {
    const { gl, calls } = linearGL();
    const be = new WebGL2Backend(gl);
    const colour = image();
    const atlas = asData(image());
    be.begin(0xffffffff, 100, 50, 1);
    be.quad(M, colour, 0, 0, 16, 16, 0xffffffff, 0, true);
    be.quad(M, atlas, 0, 0, 16, 16, 0xffffffff, 0, true);
    be.end();
    const formats = calls.filter((c) => c.name === "texImage2D").map((c) => c.args[2]);
    // white placeholder, then the colour image as sRGB and the atlas raw
    expect(formats).toEqual(["RGBA", "SRGB8_ALPHA8", "RGBA"]);
    expect(calls.some((c) => c.name === "texStorage2D" && c.args[2] === "SRGB8_ALPHA8")).toBe(true);
    const last = calls.filter((c) => c.name === "bindFramebuffer").at(-1);
    expect(last?.args[1]).toBeNull();
    expect(calls.filter((c) => c.name === "drawArrays").length).toBe(1);
  });

  it('keeps an image tagged with Symbol.for("spryte.data") raw, as asData does', () => {
    const { gl, calls } = linearGL();
    const be = new WebGL2Backend(gl);
    const atlas = Object.assign(image(), { [Symbol.for("spryte.data")]: true });
    be.begin(0xffffffff, 100, 50, 1);
    be.quad(M, atlas, 0, 0, 16, 16, 0xffffffff, 0, true);
    be.end();
    expect(calls.filter((c) => c.name === "texImage2D").map((c) => c.args[2])).toEqual(["RGBA", "RGBA"]);
  });

  it("keeps half-float targets as half floats, since they already hold linear light", () => {
    const { gl, calls } = linearGL();
    (gl as unknown as Record<string, unknown>).getExtension = (name: string) => (name === "EXT_color_buffer_float" ? {} : null);
    const draw = new Draw(new WebGL2Backend(gl), false);
    const hdr = draw.createTarget(8, 8, { format: "rgba16f" });
    const colour = draw.createTarget(8, 8);
    draw.begin("#000", 100, 50, 1);
    draw.into(hdr, () => {});
    draw.into(colour, () => {});
    draw.end();
    const formats = calls.filter((c) => c.name === "texImage2D").map((c) => c.args[2]);
    expect(formats).toContain("RGBA16F");
    expect(formats).toContain("SRGB8_ALPHA8");
  });

  it("clears with the colour in linear light", () => {
    const { gl, calls } = linearGL();
    const be = new WebGL2Backend(gl);
    be.begin(0x808080ff, 100, 50, 1);
    const r = (calls.filter((c) => c.name === "clearColor").at(-1)?.args ?? [])[0] as number;
    expect(r).toBeCloseTo(byteToLinear(0x80), 5);
    expect(r).toBeLessThan(0.3);
  });

  it("leaves sRGB contexts drawing straight to the canvas", () => {
    const { gl, count } = fakeGL();
    const be = new WebGL2Backend(gl);
    be.begin(0xffffffff, 100, 50, 1);
    be.quad(M, image(), 0, 0, 16, 16, 0xffffffff, 0, true);
    be.end();
    expect(count("texStorage2D")).toBe(0);
    expect(count("drawArrays")).toBe(0);
  });

  it("keeps a data target raw and a colour target sRGB", () => {
    const { gl, calls } = linearGL();
    const be = new WebGL2Backend(gl);
    be.begin(0xffffffff, 100, 50, 1);
    be.setTarget(asData(new RenderTarget(8, 8)), 0, 8, 8);
    be.setTarget(new RenderTarget(8, 8), 0, 8, 8);
    const formats = calls.filter((c) => c.name === "texImage2D" && c.args[3] === 8).map((c) => c.args[2]);
    expect(formats).toEqual(["RGBA", "SRGB8_ALPHA8"]);
  });
});
