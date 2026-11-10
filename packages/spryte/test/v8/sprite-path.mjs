// Runs draw.sprite through the built WebGL2 backend over a no-op GL, so V8 compiles the sprite path.
// v8-budget.test.ts starts it with --print-bytecode and reads the sizes.
import { Draw } from "../../dist/draw.js";
import { WebGL2Backend } from "../../dist/webgl2.js";

const noop = () => undefined;
const obj = () => ({});
const base = {
  canvas: { addEventListener: noop, removeEventListener: noop },
  drawingBufferWidth: 320,
  drawingBufferHeight: 180,
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getUniformLocation: obj,
  getParameter: () => 16384,
  checkFramebufferStatus: () => 0,
};
const gl = new Proxy(base, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k !== "string") return undefined;
    if (/^[A-Z0-9_]+$/.test(k)) return 1;
    return k.startsWith("create") ? obj : noop;
  },
});
const draw = new Draw(new WebGL2Backend(gl), false);
const image = { width: 16, height: 16 };
const o = { rotation: 0, tint: 0xffffffff };
draw.begin(0x000000ff, 320, 180, 1);
for (let i = 0; i < 100; i++) draw.sprite(image, i * 1.5, i * 0.5, o);
draw.end();
