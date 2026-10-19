import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipRecorder, challengeLink, clipFile, readChallenge, share } from "../src/index.js";

describe("challenge links", () => {
  it("round-trips data, including non-ASCII text", () => {
    const url = challengeLink({ seed: 42, score: 4200, name: "スライム", hard: true }, "https://example.com/game/?x=1#top");
    expect(url.startsWith("https://example.com/game/?x=1&challenge=")).toBe(true);
    expect(url).not.toContain("#");
    expect(readChallenge(url)).toEqual({ seed: 42, score: 4200, name: "スライム", hard: true });
  });

  it("reads malformed or missing challenges as none", () => {
    expect(readChallenge("https://example.com/")).toBeUndefined();
    expect(readChallenge("https://example.com/?challenge=%%%")).toBeUndefined();
    expect(readChallenge(`https://example.com/?challenge=${btoa("[1,2]")}`)).toBeUndefined();
  });
});

describe("share", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the share sheet, with files only when accepted", async () => {
    const sheet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: sheet, canShare: () => false });
    const file = new File(["x"], "clip.webm");
    expect(await share({ text: "hi", url: "https://a.test/", files: [file] })).toBe("shared");
    expect(sheet).toHaveBeenCalledWith({ url: "https://a.test/", text: "hi" });
  });

  it("reports a dismissed sheet as cancelled", async () => {
    vi.stubGlobal("navigator", { share: () => Promise.reject(new DOMException("no", "AbortError")) });
    expect(await share({ text: "hi" })).toBe("cancelled");
  });

  it("falls back to the clipboard, then to unsupported", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await share({ text: "beat me", url: "https://a.test/" })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("beat me https://a.test/");
    vi.stubGlobal("navigator", {});
    expect(await share({ text: "x" })).toBe("unsupported");
  });
});

class FakeRecorder {
  static isTypeSupported = (t: string) => t === "video/webm;codecs=vp8";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["frame"]) });
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

describe("ClipRecorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is unsupported without MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const clips = new ClipRecorder(document.createElement("canvas"));
    expect(clips.start()).toBe(false);
    expect(clips.recording).toBe(false);
  });

  it("returns the longer-running window and keeps recording", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const canvas = document.createElement("canvas");
    const track = { stop: vi.fn() };
    (HTMLCanvasElement.prototype as unknown as { captureStream: unknown }).captureStream = () => ({ getTracks: () => [track] });
    const clips = new ClipRecorder(canvas, { seconds: 10 });
    expect(await clips.clip()).toBeUndefined();
    expect(clips.mimeType).toBe("video/webm;codecs=vp8");
    expect(clips.start()).toBe(true);
    vi.advanceTimersByTime(7000);
    const clip = await clips.clip();
    expect(clip?.extension).toBe("webm");
    expect(clip?.blob.type).toBe("video/webm");
    expect(clips.recording).toBe(true);
    expect(clipFile(clip!, "run").name).toBe("run.webm");
    vi.advanceTimersByTime(30000);
    clips.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(clips.recording).toBe(false);
  });
});
