import { describe, expect, it } from "vitest";
import { refuseForeign } from "../src/agent-link.js";

const req = (method: string, headers: Record<string, string>) => ({ method, headers });

describe("refuseForeign", () => {
  it("rejects a foreign Origin with 403", () => {
    const r = refuseForeign(req("POST", { host: "localhost:5173", origin: "https://evil.example", "content-type": "application/json" }));
    expect(r?.status).toBe(403);
    expect(r?.error).toMatch(/^\[debuff\]/);
    expect(refuseForeign(req("GET", { host: "localhost:5173", origin: "http://localhost:6666" }))?.status).toBe(403);
  });

  it("rejects text/plain POSTs", () => {
    expect(refuseForeign(req("POST", { host: "localhost:5173", "content-type": "text/plain" }))?.status).toBe(415);
    expect(refuseForeign(req("POST", { host: "localhost:5173" }))?.status).toBe(415);
  });

  it("allows same-origin JSON, loopback equivalents and Node clients", () => {
    expect(
      refuseForeign(
        req("POST", { host: "localhost:5173", origin: "http://localhost:5173", "content-type": "application/json; charset=utf-8" }),
      ),
    ).toBeUndefined();
    expect(
      refuseForeign(req("POST", { host: "127.0.0.1:5173", origin: "https://[::1]:5173", "content-type": "application/json" })),
    ).toBeUndefined();
    expect(refuseForeign(req("POST", { host: "localhost:5173", "content-type": "application/json" }))).toBeUndefined();
    expect(refuseForeign(req("GET", { host: "localhost:5173", origin: "http://localhost:5173" }))).toBeUndefined();
  });
});
