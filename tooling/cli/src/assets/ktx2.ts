import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decode } from "fast-png";

/** GPU block-compression families, named as spryte's `draw.compressedFormats` names them. */
export type CompressedFormat = "bc7" | "etc2" | "astc4x4";

export const COMPRESSED_FORMATS: readonly CompressedFormat[] = ["bc7", "astc4x4", "etc2"];

// Basis transcoder target and the KTX2 vkFormat (SRGB variant) for each family.
const TARGETS: Record<CompressedFormat, { basis: number; vk: number }> = {
  bc7: { basis: 6, vk: 146 },
  etc2: { basis: 1, vk: 152 },
  astc4x4: { basis: 10, vk: 158 },
};

interface BasisModule {
  initializeBasis(): void;
  BasisEncoder: new () => {
    setCreateKTX2File(v: boolean): void;
    setUASTC(v: boolean): void;
    setMipGen(v: boolean): void;
    setKTX2UASTCSupercompression(v: boolean): void;
    setSliceSourceImage(slice: number, rgba: Uint8Array, w: number, h: number, type: number): boolean;
    encode(out: Uint8Array): number;
    delete(): void;
  };
  KTX2File: new (
    bytes: Uint8Array,
  ) => {
    getLevels(): number;
    startTranscoding(): number;
    getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
    transcodeImage(dst: Uint8Array, level: number, layer: number, face: number, format: number, a: number, c0: number, c1: number): number;
    close(): void;
    delete(): void;
  };
}

let basis: Promise<BasisModule> | undefined;

/**
 * Basis Universal, as ktx2-encoder bundles it. That package exports only its encoder, which writes supercompressed
 * files; spryte wants plain GPU blocks, so this loads the bundled module (encoder and transcoder) by path.
 */
function loadBasis(): Promise<BasisModule> {
  basis ??= (async () => {
    // The node entry is dist/node/index.js; the Basis module sits next to it in dist/basis.
    const entry = fileURLToPath(import.meta.resolve("ktx2-encoder"));
    const url = pathToFileURL(join(dirname(entry), "..", "basis", "basis_encoder.js")).href;
    const factory = (await import(url)).default as (opts: object) => Promise<BasisModule>;
    const m = await factory({ print: () => {}, printErr: () => {} });
    m.initializeBasis();
    return m;
  })();
  return basis;
}

/**
 * Encode a PNG once to UASTC with a full mip chain, then transcode it to each format, so every variant comes from
 * the same encode. Colour is premultiplied first: spryte draws premultiplied colour and can't premultiply blocks.
 */
export async function compressPng(png: Uint8Array, formats: readonly CompressedFormat[]): Promise<Map<CompressedFormat, Uint8Array>> {
  const m = await loadBasis();
  const img = decode(png);
  const { width: w, height: h } = img;
  const rgba = premultiplied(img.data, img.channels, w * h, img.depth === 16);
  const encoder = new m.BasisEncoder();
  let uastc: Uint8Array;
  try {
    encoder.setCreateKTX2File(true);
    encoder.setUASTC(true);
    encoder.setMipGen(true);
    encoder.setKTX2UASTCSupercompression(false);
    if (!encoder.setSliceSourceImage(0, rgba, w, h, 0)) throw new Error("the encoder rejected the image");
    const out = new Uint8Array(w * h * 8 + 65536);
    const n = encoder.encode(out);
    if (n <= 0) throw new Error("the encoder produced nothing");
    uastc = out.subarray(0, n);
  } finally {
    encoder.delete();
  }
  const file = new m.KTX2File(uastc);
  try {
    if (!file.startTranscoding()) throw new Error("couldn't read the encoded file");
    const result = new Map<CompressedFormat, Uint8Array>();
    for (const format of formats) {
      const levels: Uint8Array[] = [];
      for (let l = 0; l < file.getLevels(); l++) {
        const dst = new Uint8Array(file.getImageTranscodedSizeInBytes(l, 0, 0, TARGETS[format].basis));
        if (!file.transcodeImage(dst, l, 0, 0, TARGETS[format].basis, 0, -1, -1)) throw new Error(`transcoding to ${format} failed`);
        levels.push(dst);
      }
      result.set(format, writeKtx2(TARGETS[format].vk, w, h, levels));
    }
    return result;
  } finally {
    file.close();
    file.delete();
  }
}

function premultiplied(data: ArrayLike<number>, channels: number, pixels: number, wide: boolean): Uint8Array {
  const out = new Uint8Array(pixels * 4);
  const scale = wide ? 257 : 1;
  for (let i = 0; i < pixels; i++) {
    const at = i * channels;
    const grey = channels < 3;
    const a = channels === 4 || channels === 2 ? (data[at + channels - 1] as number) / scale : 255;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((((data[at + (grey ? 0 : c)] as number) / scale) * a) / 255);
    out[i * 4 + 3] = a;
  }
  return out;
}

const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A KTX2 file of plain blocks: no supercompression, no key/value data. The data format descriptor carries the
 * sRGB transfer function and the premultiplied-alpha flag, which is what spryte reads from it.
 */
function writeKtx2(vkFormat: number, width: number, height: number, levels: Uint8Array[]): Uint8Array {
  const dfdOffset = 80 + levels.length * 24;
  const dfdLength = 4 + 24;
  // Level data is stored smallest first and 16-byte aligned (a block is 16 bytes).
  let at = Math.ceil((dfdOffset + dfdLength) / 16) * 16;
  const offsets: number[] = [];
  for (let i = levels.length - 1; i >= 0; i--) {
    offsets[i] = at;
    at = Math.ceil((at + (levels[i] as Uint8Array).length) / 16) * 16;
  }
  const bytes = new Uint8Array(at);
  const v = new DataView(bytes.buffer);
  bytes.set(ID, 0);
  [vkFormat, 1, width, height, 0, 0, 1, levels.length, 0].forEach((n, i) => {
    v.setUint32(12 + i * 4, n, true);
  });
  v.setUint32(48, dfdOffset, true);
  v.setUint32(52, dfdLength, true);
  levels.forEach((level, i) => {
    const offset = offsets[i] as number;
    v.setBigUint64(80 + i * 24, BigInt(offset), true);
    v.setBigUint64(88 + i * 24, BigInt(level.length), true);
    v.setBigUint64(96 + i * 24, BigInt(level.length), true);
    bytes.set(level, offset);
  });
  // Basic descriptor block: version 2, 24 bytes; sRGB transfer, premultiplied flag;
  // 4x4 texel blocks (stored as 3, 3) of 16 bytes.
  v.setUint32(dfdOffset, dfdLength, true);
  v.setUint32(dfdOffset + 8, 2 | (24 << 16), true);
  bytes[dfdOffset + 13] = 1; // BT.709 primaries
  bytes[dfdOffset + 14] = 2;
  bytes[dfdOffset + 15] = 1;
  bytes[dfdOffset + 16] = 3;
  bytes[dfdOffset + 17] = 3;
  bytes[dfdOffset + 20] = 16;
  return bytes;
}
