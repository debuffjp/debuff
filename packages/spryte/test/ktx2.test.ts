import { describe, expect, it } from "vitest";
import { CompressedTexture, parseKtx2 } from "../src/index.js";

const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** A KTX2 file with the given vkFormat and levels (largest first), and a DFD whose flags byte is `flags`. */
function ktx2({ vkFormat = 145, width = 8, height = 4, levels = [new Uint8Array(32).fill(7)], flags = 1, scheme = 0 } = {}) {
  const levelIndex = 80;
  const dfdOffset = levelIndex + levels.length * 24;
  const dfdLength = 4 + 24;
  let at = dfdOffset + dfdLength;
  const offsets = levels.map((l) => {
    const o = at;
    at += l.length;
    return o;
  });
  const bytes = new Uint8Array(at);
  const v = new DataView(bytes.buffer);
  bytes.set(ID, 0);
  [vkFormat, 1, width, height, 0, 0, 1, levels.length, scheme].forEach((n, i) => {
    v.setUint32(12 + i * 4, n, true);
  });
  v.setUint32(48, dfdOffset, true);
  v.setUint32(52, dfdLength, true);
  levels.forEach((l, i) => {
    v.setBigUint64(levelIndex + i * 24, BigInt(offsets[i] as number), true);
    v.setBigUint64(levelIndex + i * 24 + 8, BigInt(l.length), true);
    bytes.set(l, offsets[i] as number);
  });
  v.setUint32(dfdOffset, dfdLength, true);
  bytes[dfdOffset + 4 + 11] = flags;
  return bytes;
}

describe("parseKtx2", () => {
  it("reads size, format, alpha and every level", () => {
    const big = new Uint8Array(32).fill(1);
    const small = new Uint8Array(16).fill(2);
    const t = parseKtx2(ktx2({ vkFormat: 146, levels: [big, small] }));
    expect(t).toBeInstanceOf(CompressedTexture);
    expect([t.width, t.height, t.format, t.premultiplied]).toEqual([8, 4, "bc7", true]);
    expect(t.levels).toEqual([big, small]);
  });

  it("names the three format families and reads straight alpha", () => {
    expect(parseKtx2(ktx2({ vkFormat: 152 })).format).toBe("etc2");
    expect(parseKtx2(ktx2({ vkFormat: 157 })).format).toBe("astc4x4");
    expect(parseKtx2(ktx2({ flags: 0 })).premultiplied).toBe(false);
  });

  it("works on a view into a larger buffer", () => {
    const file = ktx2();
    const padded = new Uint8Array(file.length + 10);
    padded.set(file, 10);
    expect(parseKtx2(padded.subarray(10)).levels[0]).toEqual(new Uint8Array(32).fill(7));
  });

  it("throws a clear error for files it can't use", () => {
    expect(() => parseKtx2(new Uint8Array(100))).toThrow(/not a KTX2 file/);
    expect(() => parseKtx2(ktx2({ vkFormat: 37 }))).toThrow(/vkFormat 37/);
    expect(() => parseKtx2(ktx2({ scheme: 1 }))).toThrow(/supercompress/);
    expect(() => parseKtx2(ktx2().subarray(0, 120))).toThrow(/truncated/);
  });
});
