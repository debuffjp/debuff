/** GPU block-compression families spryte uploads: BC7 (desktop), ETC2 and ASTC 4x4 (mobile). */
export type CompressedFormat = "bc7" | "etc2" | "astc4x4";

/**
 * A block-compressed image, ready to upload as it is: it stays compressed in video memory, at 1 byte per pixel
 * instead of 4. Make one with {@link parseKtx2} and draw it like any image. Only the WebGL2 backend can draw it,
 * and only when the GPU supports its format: check `draw.compressedFormats` and load another file otherwise.
 */
export class CompressedTexture {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly format: CompressedFormat,
    /** Mip levels, largest first. */
    readonly levels: readonly Uint8Array[],
    /** Whether colour was multiplied by alpha when encoded. spryte draws premultiplied colour, so encode it that way. */
    readonly premultiplied: boolean,
  ) {}
}

const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

// Vulkan format numbers, UNORM and SRGB of each: the bytes are the same, so spryte picks the GL format from the blend space.
const FORMATS: Record<number, CompressedFormat> = { 145: "bc7", 146: "bc7", 151: "etc2", 152: "etc2", 157: "astc4x4", 158: "astc4x4" };

/**
 * Reads a KTX2 file holding BC7, ETC2 (RGBA) or ASTC 4x4 data, as written by `toktx`, `basisu` or `ktx create`.
 * Supercompressed files (Basis, zstd) aren't supported: encode straight to the GPU format. Throws when the file
 * can't be used, naming why.
 */
export function parseKtx2(bytes: Uint8Array): CompressedTexture {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 80 || ID.some((b, i) => bytes[i] !== b)) throw new Error("spryte: not a KTX2 file");
  const u32 = (at: number) => v.getUint32(at, true);
  const vkFormat = u32(12);
  const format = FORMATS[vkFormat];
  if (!format) throw new Error(`spryte: KTX2 vkFormat ${vkFormat} isn't BC7, ETC2 RGBA or ASTC 4x4`);
  const width = u32(20);
  const height = u32(24);
  if (u32(28) > 1 || u32(32) > 1 || u32(36) > 1) throw new Error("spryte: KTX2 arrays, cube maps and 3D textures aren't supported");
  if (u32(44) !== 0) throw new Error("spryte: supercompressed KTX2 (Basis, zstd) isn't supported");
  const count = Math.max(1, u32(40));
  const truncated = () => new Error("spryte: KTX2 file is truncated");
  if (bytes.length < 80 + count * 24) throw truncated();
  const levels: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Number(v.getBigUint64(80 + i * 24, true));
    const length = Number(v.getBigUint64(88 + i * 24, true));
    if (offset + length > bytes.length) throw truncated();
    levels.push(bytes.subarray(offset, offset + length));
  }
  // Basic data format descriptor: the flags byte is the last of its third word. Bit 0 is ALPHA_PREMULTIPLIED.
  const dfd = u32(48);
  const premultiplied = u32(52) >= 16 && dfd + 16 <= bytes.length && ((bytes[dfd + 15] as number) & 1) === 1;
  return new CompressedTexture(width, height, format, levels, premultiplied);
}
