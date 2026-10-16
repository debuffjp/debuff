import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Audio } from "../src/index.js";

/** Minimal Web Audio stand-in that records node graph activity. */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
  });
}
class FakeNode {
  gain = new FakeParam();
  pan = new FakeParam();
  frequency = new FakeParam();
  playbackRate = new FakeParam();
  buffer: unknown = null;
  loop = false;
  type = "";
  started = false;
  connect = vi.fn((n: unknown) => n);
  start = vi.fn(() => {
    this.started = true;
  });
  stop = vi.fn();
}
const created: FakeNode[] = [];
const node = () => {
  const n = new FakeNode();
  created.push(n);
  return n;
};
class FakeContext {
  state = "suspended";
  currentTime = 0;
  sampleRate = 8;
  destination = {};
  createGain = node;
  createBufferSource = node;
  createOscillator = node;
  createStereoPanner = node;
  createBiquadFilter = node;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  createBuffer = () => ({ getChannelData: () => new Float32Array(8) });
}

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => vi.unstubAllGlobals());

describe("Audio", () => {
  it("unlocks on the first user gesture", async () => {
    const audio = new Audio();
    expect(audio.unlocked).toBe(false);
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(audio.unlocked).toBe(true);
  });

  it("plays decoded buffers and explains missing ones", async () => {
    const audio = new Audio();
    expect(() => audio.play("boom")).toThrow(/not decoded. Call audio.decode\("boom"/);
    await audio.decode("boom", new ArrayBuffer(4));
    expect(audio.has("boom")).toBe(true);
    audio.play("boom", { volume: 0.5, loop: true });
    expect(created.some((n) => n.loop && n.started)).toBe(true);
  });

  it("synthesises tones and noise without assets", () => {
    const audio = new Audio();
    const voice = audio.synth({ freq: 440, freqEnd: 220, decay: 0.1 });
    audio.synth({ wave: "noise", freq: 1000, decay: 0.1 });
    expect(created.filter((n) => n.started)).toHaveLength(2);
    voice.stop(0.1);
  });

  it("sets bus volume", () => {
    const audio = new Audio();
    audio.volume("music", 0.25);
    expect(created.some((n) => n.gain.value === 0.25)).toBe(true);
  });
});
