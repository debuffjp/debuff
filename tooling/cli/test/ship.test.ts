import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { ship, shipFailed, writeLaunchFiles, zip } from "../src/index.js";

let root: string;
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

function project(html = '<html><head><title>t</title></head><body><script src="./a.js"></script></body></html>') {
  root = mkdtempSync(join(tmpdir(), "debuff-ship-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "jelly", description: "Squish & match <blobs>" }));
  mkdirSync(join(root, "dist", "assets"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), html);
  writeFileSync(join(root, "dist", "assets", "a.js"), "console.log(1)".repeat(50));
  writeFileSync(join(root, "dist", "a.js.map"), "{}");
  mkdirSync(join(root, "scenarios", "__baselines__", "start"), { recursive: true });
  writeFileSync(join(root, "scenarios", "__baselines__", "start", "title.png"), PNG);
  return root;
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("writeLaunchFiles", () => {
  it("adds preview tags, a manifest and a preview image, escaping text", () => {
    project();
    const warnings = writeLaunchFiles(root, join(root, "dist"), { url: "https://me.itch.io/jelly", background: "#11140d" });
    expect(warnings).toEqual([]);
    const html = readFileSync(join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('<meta property="og:title" content="t" />');
    expect(html).toContain('content="Squish &amp; match &lt;blobs>"');
    expect(html).toContain('<meta property="og:image" content="https://me.itch.io/jelly/preview.png" />');
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest" />');
    expect(html.indexOf("og:title")).toBeLessThan(html.indexOf("</head>"));
    const manifest = JSON.parse(readFileSync(join(root, "dist", "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ name: "t", display: "fullscreen", theme_color: "#11140d", start_url: "." });
    expect(existsSync(join(root, "dist", "preview.png"))).toBe(true);
  });

  it("keeps hand-written tags, warns without a url, and can be turned off", () => {
    project('<html><head><meta property="og:title" content="Mine" /></head></html>');
    expect(writeLaunchFiles(root, join(root, "dist"), { icon: "nope.png" })).toEqual([
      "launch.icon nope.png not found",
      "set launch.url so link previews can show the image (crawlers need an absolute URL)",
    ]);
    const html = readFileSync(join(root, "dist", "index.html"), "utf8");
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).toContain('content="preview.png"');
    rmSync(join(root, "dist", "manifest.webmanifest"));
    expect(writeLaunchFiles(root, join(root, "dist"), { enabled: false })).toEqual([]);
    expect(existsSync(join(root, "dist", "manifest.webmanifest"))).toBe(false);
  });

  it("adds og:video with the clip's size from its tkhd box", () => {
    project();
    const sized = (type: string, body: Buffer) => {
      const b = Buffer.concat([Buffer.alloc(4), Buffer.from(type, "latin1"), body]);
      b.writeUInt32BE(b.length, 0);
      return b;
    };
    const tkhd = Buffer.alloc(84);
    tkhd.writeUInt32BE(1280 << 16, 76);
    tkhd.writeUInt32BE(720 << 16, 80);
    const mp4 = Buffer.concat([sized("ftyp", Buffer.from("isom")), sized("moov", sized("trak", sized("tkhd", tkhd)))]);
    writeFileSync(join(root, "loop.mp4"), mp4);
    expect(writeLaunchFiles(root, join(root, "dist"), { url: "https://me.itch.io/jelly", video: "loop.mp4" })).toEqual([]);
    const html = readFileSync(join(root, "dist", "index.html"), "utf8");
    expect(html).toContain('<meta property="og:video" content="https://me.itch.io/jelly/preview.mp4" />');
    expect(html).toContain('<meta property="og:video:secure_url" content="https://me.itch.io/jelly/preview.mp4" />');
    expect(html).toContain('<meta property="og:video:type" content="video/mp4" />');
    expect(html).toContain('<meta property="og:video:width" content="1280" />');
    expect(html).toContain('<meta property="og:video:height" content="720" />');
    expect(existsSync(join(root, "dist", "preview.mp4"))).toBe(true);
    expect(writeLaunchFiles(root, join(root, "dist"), { video: "nope.mp4" })).toContain("launch.video nope.mp4 not found");
  });
});

describe("ship", () => {
  it("zips dist for itch without source maps or reports", () => {
    project();
    const result = ship(root, "itch");
    expect(shipFailed(result)).toBe(false);
    expect(result.outputs).toEqual(["ship/itch.zip"]);
    const data = readFileSync(join(root, "ship", "itch.zip"));
    expect(data.readUInt32LE(0)).toBe(0x04034b50);
    const names = data.toString("latin1");
    expect(names).toContain("assets/a.js");
    expect(names).not.toContain("a.js.map");
  });

  it("fails itch on root-absolute asset paths and a missing build", () => {
    project('<html><head></head><body><script src="/assets/a.js"></script></body></html>');
    expect(shipFailed(ship(root, "itch"))).toBe(true);
    rmSync(join(root, "dist"), { recursive: true });
    expect(ship(root, "itch").checks[0]?.ok).toBe(false);
  });

  it("checks wavedash.toml and the init call", () => {
    project();
    expect(shipFailed(ship(root, "wavedash"))).toBe(true);
    writeFileSync(join(root, "wavedash.toml"), 'game_id = "x"\nupload_dir = "./dist"\n');
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "main.ts"), "Wavedash.init({ debug: false });");
    const result = ship(root, "wavedash");
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.next[1]).toContain("wavedash build push");
  });

  it("builds a press kit from baselines and package.json", () => {
    project();
    const result = ship(root, "press", { author: "Gel Studio", links: { Discord: "https://discord.gg/x" } });
    expect(shipFailed(result)).toBe(false);
    expect(result.outputs).toContain("ship/press/screenshots/01-start-title.png");
    const readme = readFileSync(join(root, "ship", "press", "README.md"), "utf8");
    expect(readme).toContain("# jelly");
    expect(readme).toContain("**Developer:** Gel Studio");
    expect(readme).toContain("![](screenshots/01-start-title.png)");
    expect(readme).toContain("[Discord](https://discord.gg/x)");
  });
});

describe("zip", () => {
  it("writes entries that inflate back to the source", () => {
    project();
    const file = join(root, "dist", "index.html");
    const data = zip(join(root, "dist"), [file]);
    const nameLength = data.readUInt16LE(26);
    const size = data.readUInt32LE(18);
    const body = data.subarray(30 + nameLength, 30 + nameLength + size);
    expect(inflateRawSync(body).toString()).toBe(readFileSync(file, "utf8"));
    expect(data.readUInt32LE(data.length - 22)).toBe(0x06054b50);
  });
});
