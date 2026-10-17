import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mulberry32, VirtualClock } from "../src/clock.js";
import { imageSize, inert, openPage } from "../src/environment.js";
import {
  findTests,
  firstOwnFrame,
  formatResult,
  formatSummary,
  pageScripts,
  runTests,
  type TestReport,
  usesDebuff,
} from "../src/runner.js";

const fixture = fileURLToPath(new URL("./fixture", import.meta.url));
const generic = fileURLToPath(new URL("./fixture-generic", import.meta.url));

describe("runTests", { timeout: 60_000 }, () => {
  let report: TestReport;
  const result = (name: string) => {
    const r = report.results.find((x) => x.name === name);
    if (!r) throw new Error(`no result for ${name}`);
    return r;
  };

  it("runs a project's tests against the real game, headless", async () => {
    const seen: string[] = [];
    report = await runTests({ root: fixture, files: ["tests/dot.test.ts"], onResult: (r) => seen.push(r.name) });
    expect(seen).toHaveLength(10);
    expect(report).toMatchObject({ ok: false, passed: 2, failed: 6, skipped: 1, todo: 1 });
    expect(result("walks right at its speed").status).toBe("pass");
    expect(result("sweeps speed").status).toBe("pass");
  });

  it("reports failures with the source line, the game's state and the console", () => {
    const r = result("a failing expectation reports the game state");
    expect(r.error).toMatchObject({ kind: "ExpectationError", message: "expected 5 to be 6", game: { scene: "play", state: { x: 5 } } });
    expect(r.error?.where).toMatch(/^tests\/dot\.test\.ts:21:\d+$/);
    expect(r.logs).toEqual(["about to fail"]);
    const text = formatResult(r);
    expect(text).toContain("expected 5 to be 6");
    expect(text).toContain("tick 0");
    expect(text).toContain("about to fail");
  });

  it("turns game crashes, timeouts, stray rejections and boot problems into failures", () => {
    expect(result("a crash in the game fails with where it happened").error).toMatchObject({
      kind: "GameError",
      message: 'the game threw at tick 3 in scene "play": the dot fell over',
    });
    expect(result("slow tests time out").error?.message).toBe("the test took longer than 50 ms of real time");
    expect(result("stray promise rejections fail the test that caused them").error?.message).toBe("stray");
    expect(result("a ready check that never passes").error?.message).toMatch(/your `ready` check never passed/);
    expect(result("a page without the game").error?.message).toMatch(/no page at missing\.html/);
  });

  it("formats skips, todos and the summary", () => {
    expect(formatResult(result("skipped"))).toMatch(/skip/);
    expect(formatResult(result("todo"))).toMatch(/todo/);
    expect(formatResult(result("walks right at its speed"))).toMatch(/pass/);
    expect(formatSummary(report)).toMatch(/2 passed · .*6 failed.* · 1 skipped · 1 todo in \d+ ms/);
  });

  it("filters by name and reports files that fail to load", async () => {
    const filtered = await runTests({ root: fixture, files: ["tests/dot.test.ts", "broken/syntax.test.ts"], filter: "WALKS" });
    expect(filtered.results.map((r) => [r.name, r.status])).toEqual([["walks right at its speed", "pass"]]);
    const broken = await runTests({ root: fixture, files: ["broken/syntax.test.ts"] });
    expect(broken.results[0]).toMatchObject({
      name: "(loading the file)",
      status: "fail",
      error: { message: "this file can't even load" },
    });
  });

  it("finds nothing to do in a project without tests", async () => {
    const empty = mkdtempSync(join(tmpdir(), "debuff-test-"));
    try {
      expect(await runTests({ root: empty })).toMatchObject({ ok: true, results: [] });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("any web game", { timeout: 60_000 }, () => {
  it("drives a plain requestAnimationFrame game through DOM events and the virtual clock", async () => {
    const report = await runTests({ root: generic });
    const status = Object.fromEntries(report.results.map((r) => [r.name, r.status]));
    expect(status).toMatchObject({
      "walks on DOM key events and frame timestamps": "pass",
      'Space arrives as the key " "': "pass",
      "pointer taps reach the canvas": "pass",
      "params through __KEIKO__": "pass",
      "setTimeout and setInterval run on the virtual clock": "pass",
      "Math.random is seeded": "pass",
      "same seed: deterministic": "pass",
    });
    const error = (name: string) => report.results.find((r) => r.name === name)?.error;
    expect(error("different seeds expose the unseeded sparkle")?.message).toMatch(/diverged at tick 2: state\.sparkle was/);
    expect(error("hookless games are read through the page, and their crashes are caught")).toMatchObject({
      kind: "GameError",
      message: "the game threw at tick 3: frame 3 is cursed",
      where: expect.stringMatching(/^src\/bare\.js:\d+:27$/),
    });
    expect(error("commands the game doesn't expose explain how to add them")).toMatchObject({ kind: "MissingHookError" });
  });

  it("detects debuff projects from their dependencies", () => {
    expect(usesDebuff(fixture)).toBe(true);
    expect(usesDebuff(generic)).toBe(false);
    expect(usesDebuff(join(generic, "missing"))).toBe(false);
  });
});

describe("discovery", () => {
  it("finds *.test files under tests/ and src/, skipping build and dependency folders", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-test-"));
    try {
      for (const f of [
        "tests/a.test.ts",
        "tests/deep/b.test.mjs",
        "src/c.test.js",
        "src/main.ts",
        "src/node_modules/x.test.ts",
        "other/d.test.ts",
      ]) {
        mkdirSync(join(root, f, ".."), { recursive: true });
        writeFileSync(join(root, f), "");
      }
      expect(findTests(root)).toEqual(["src/c.test.js", "tests/a.test.ts", "tests/deep/b.test.mjs"]);
      expect(findTests(root, ["./other/d.test.ts"])).toEqual(["other/d.test.ts"]);
      expect(findTests(root, ["tests", "src/c.test.js"])).toEqual(["tests/a.test.ts", "tests/deep/b.test.mjs", "src/c.test.js"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a page's module scripts in order", () => {
    const html = `<script src="/legacy.js"></script><script type="module" src="/src/a.ts"></script>
      <script type=module src='/src/b.ts'></script><script type="module">inline()</script>`;
    expect(pageScripts(html)).toEqual(["/src/a.ts", "/src/b.ts"]);
  });

  it("points at the first stack frame in the project", () => {
    const root = process.platform === "win32" ? "C:\\game" : "/game";
    const own = process.platform === "win32" ? "C:\\game\\tests\\a.test.ts" : "/game/tests/a.test.ts";
    const stack = [
      "Error: x",
      "    at check (/elsewhere/node_modules/@debuffjp/test/dist/expect.js:10:5)",
      `    at eval (${own}:12:7)`,
    ].join("\n");
    expect(firstOwnFrame(stack, root)).toBe("tests/a.test.ts:12:7");
    expect(firstOwnFrame("Error: x\n    at native", root)).toBeUndefined();
  });
});

describe("headless page", () => {
  it("has a DOM, inert 2D and WebGL contexts and silent audio, and restores Node's globals", async () => {
    const before = globalThis.addEventListener;
    const clock = new VirtualClock({ seed: 3 });
    const page = openPage({
      origin: "http://localhost:1/",
      path: "/",
      html: '<canvas id="game"></canvas><script>nope()</script>',
      search: { "debuff-scenario": "1" },
      clock,
    });
    try {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      expect(canvas).toBeTruthy();
      expect(location.search).toBe("?debuff-scenario=1");
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
      expect(gl).toBe(canvas.getContext("webgl2"));
      expect(gl).toBeInstanceOf(WebGL2RenderingContext);
      expect(gl.getParameter(gl.VERSION)).toMatch(/^WebGL 2.0/);
      expect(gl.getParameter(gl.MAX_TEXTURE_SIZE)).toBe(8192);
      expect(gl.getParameter(gl.VIEWPORT)).toEqual(new Int32Array([0, 0, 300, 150]));
      expect(gl.getParameter(gl.ARRAY_BUFFER_BINDING)).toBeNull();
      const shader = gl.createShader(gl.VERTEX_SHADER) as WebGLShader;
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS)).toBe(true);
      expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
      expect(gl.drawingBufferWidth).toBe(300);
      const instanced = gl.getExtension("ANGLE_instanced_arrays") as unknown as Record<string, unknown> & {
        vertexAttribDivisorANGLE(): void;
      };
      expect(instanced.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE).toBe(0x88fe);
      instanced.vertexAttribDivisorANGLE();
      expect(gl.getExtension("NOT_a_real_extension")).toBeNull();
      expect(gl.getSupportedExtensions()).toContain("OES_vertex_array_object");
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      expect((canvas.getContext("webgl") as WebGLRenderingContext).getParameter(0x1f02)).toMatch(/^WebGL 1.0/);
      expect(canvas.getBoundingClientRect()).toMatchObject({ left: 0, top: 0, width: 300, height: 150 });
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillRect(0, 0, 1, 1);
      ctx.font = "20px monospace";
      expect(ctx.measureText("abc").width).toBeCloseTo(36);
      expect(ctx.getImageData(0, 0, 2, 2).data).toHaveLength(16);
      const audio = new AudioContext();
      const gain = audio.createGain();
      gain.gain.setTargetAtTime(1, audio.currentTime, 0.1);
      gain.connect(audio.destination);
      expect(audio.state).toBe("running");
      expect(new OffscreenCanvas(4, 4).getContext("2d")).toBeTruthy();
      let frameAt = -1;
      requestAnimationFrame((t) => {
        frameAt = t;
      });
      expect(performance.now()).toBe(0);
      clock.advance(2);
      expect(frameAt).toBeCloseTo(1000 / 60);
      expect(performance.now()).toBeCloseTo(2000 / 60);
      expect(Date.now()).toBe(Date.UTC(2026, 0, 1) + 33);
      const first = Math.random();
      expect(first).toBe(mulberry32(3)());
    } finally {
      await page.dispose();
    }
    expect(globalThis.addEventListener).toBe(before);
    expect("document" in globalThis).toBe(false);
    expect(Math.random).not.toBe(clock.requestAnimationFrame);
    expect(Date.now()).toBeGreaterThan(Date.UTC(2026, 0, 2));
  });

  it("can leave WebGL out, so engines fall back to Canvas 2D", async () => {
    const page = openPage({ origin: "http://localhost:1/", path: "/", html: "<canvas></canvas>", clock: new VirtualClock(), webgl: false });
    try {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      expect(canvas.getContext("webgl2")).toBeNull();
      expect(canvas.getContext("2d")).toBeTruthy();
      expect("WebGL2RenderingContext" in globalThis).toBe(false);
    } finally {
      await page.dispose();
    }
  });

  it("makes images real <img> elements that load from the server", async () => {
    const png = new Uint8Array(24);
    const v = new DataView(png.buffer);
    v.setUint32(0, 0x89504e47);
    v.setUint32(16, 32);
    v.setUint32(20, 16);
    const url = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
    const page = openPage({ origin: "http://localhost:1/", path: "/", clock: new VirtualClock() });
    try {
      const img = new Image();
      expect(img).toBeInstanceOf(HTMLImageElement);
      const loaded = new Promise((resolve) => img.addEventListener("load", resolve));
      img.setAttribute("src", url);
      await loaded;
      expect([img.complete, img.naturalWidth, img.naturalHeight, img.width]).toEqual([true, 32, 16, 32]);
      const viaDom = document.createElement("img");
      const failed = new Promise((resolve) => {
        viaDom.onerror = resolve;
      });
      viaDom.src = "data:,broken";
      viaDom.src = "http://localhost:1/missing.png";
      await failed;
      expect(new Image(4, 5).width).toBe(4);
    } finally {
      await page.dispose();
    }
  });

  it("reads image sizes from PNG, GIF and JPEG headers", () => {
    const png = new Uint8Array(24);
    const pv = new DataView(png.buffer);
    pv.setUint32(0, 0x89504e47);
    pv.setUint32(16, 320);
    pv.setUint32(20, 180);
    expect(imageSize(png)).toEqual({ width: 320, height: 180 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 16, 0, 8, 0]);
    expect(imageSize(gif)).toEqual({ width: 16, height: 8 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 48, 0, 64, 3, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 64, height: 48 });
    expect(imageSize(new Uint8Array(4))).toEqual({ width: 0, height: 0 });
  });

  it("makes stand-ins that absorb any use", () => {
    const thing = inert() as Record<string, (...a: unknown[]) => unknown> & { value: number };
    expect(thing.value).toBe(0);
    expect(Number(thing.whatever?.())).toBe(0);
    thing.custom = () => 1;
    expect(thing.custom()).toBe(1);
  });
});
