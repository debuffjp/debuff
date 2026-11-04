import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { buildReport } from "../src/report.js";

it("reports assets and source maps at fast Brotli quality while keeping code sizes comparable", () => {
  const dir = mkdtempSync(join(tmpdir(), "debuff-report-"));
  const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => `const item${i} = {name: "item-${i}", value: ${i % 17}};`).join("\n"));
  const fast = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length;
  const maximum = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  // This fixture distinguishes the two settings without depending on the machine's speed.
  expect(fast).not.toBe(maximum);
  const files = ["a.js", "b.mjs", "c.css", "index.html", "image.png", "data.json", "a.js.map", "extra.bin"];
  for (const file of files) writeFileSync(join(dir, file), data);
  const report = buildReport(dir);
  expect(report.files).toHaveLength(files.length);
  for (const file of report.files) {
    expect(file.bytes).toBe(data.length);
    expect(file.gzip).toBe(gzipSync(data).length);
    expect(file.brotli).toBe(file.kind === "code" || file.kind === "html" ? maximum : fast);
  }
  expect(report.totals.code.brotli).toBe(3 * maximum);
  expect(report.totals.asset.brotli).toBe(2 * fast);
  expect(report.totals.map.brotli).toBe(fast);
  expect(report.totals.other.brotli).toBe(fast);
});
