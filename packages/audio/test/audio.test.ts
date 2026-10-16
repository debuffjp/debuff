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
  createMediaElementSource = node;
  listeners: Record<string, (() => void)[]> = {};
  addEventListener(type: string, fn: () => void) {
    const list = this.listeners[type] ?? [];
    list.push(fn);
    this.listeners[type] = list;
  }
}

class FakeAudioElement {
  static last: FakeAudioElement | undefined;
  src = "";
  loop = false;
  preload = "";
  crossOrigin: string | null = null;
  playing = false;
  allowPlay = true;
  constructor() {
    FakeAudioElement.last = this;
  }
  play() {
    if (!this.allowPlay) return Promise.reject(new Error("NotAllowedError"));
    this.playing = true;
    return Promise.resolve();
  }
  pause() {
    this.playing = false;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  load() {}
}

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("Audio", FakeAudioElement);
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

  it("streams music through the music bus and controls it", async () => {
    const audio = new Audio();
    const track = audio.stream("assets/music/theme.ogg", { volume: 0.5 });
    const el = FakeAudioElement.last;
    expect(el).toMatchObject({ src: "assets/music/theme.ogg", loop: true, crossOrigin: "anonymous" });
    await Promise.resolve();
    expect(el?.playing).toBe(true);
    track.pause();
    expect(el?.playing).toBe(false);
    track.resume();
    await Promise.resolve();
    expect(el?.playing).toBe(true);
    track.stop();
    expect(el?.src).toBe("");
  });

  it("waits for the autoplay unlock when the browser blocks playback", async () => {
    const audio = new Audio();
    const el = new FakeAudioElement();
    el.allowPlay = false;
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          // biome-ignore lint/correctness/noConstructorReturn: hand back the prepared fake element
          return el;
        }
      },
    );
    audio.stream("theme.ogg");
    await new Promise((r) => setTimeout(r, 0));
    expect(el.playing).toBe(false);
    el.allowPlay = true;
    for (const fn of (audio.ctx as unknown as FakeContext).listeners.statechange ?? []) fn();
    await Promise.resolve();
    expect(el.playing).toBe(true);
  });

  it("sets bus volume", () => {
    const audio = new Audio();
    audio.volume("music", 0.25);
    expect(created.some((n) => n.gain.value === 0.25)).toBe(true);
  });
});
