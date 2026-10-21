// Checking music without ears: render a song offline and measure it. Loudness follows ITU-R BS.1770 (LUFS, the
// measure streaming services and broadcasters use), peaks and clipping are counted, and the spectrum is split into
// lows, mids and highs. `analyse` is pure maths over samples, so it runs anywhere; `render` and `mix` need Web Audio's
// OfflineAudioContext (a browser, or a Node implementation).

import { Player } from "./player.js";
import type { Song } from "./song.js";

/** Sample rate for rendering. BS.1770's K-weighting coefficients below are defined at 48 kHz. */
export const RENDER_RATE = 48000;

export interface Analysis {
  /** Highest sample, in dBFS (0 = full scale). */
  peakDb: number;
  /** Samples at or beyond full scale. Anything above 0 means audible distortion. */
  clipped: number;
  /** Integrated loudness in LUFS (gated, K-weighted). Web games sit comfortably around -16. */
  lufs: number;
  /** Share of energy below 250 Hz, 250 Hz-4 kHz, and above 4 kHz (0-1 each, summing to 1). */
  bands: { low: number; mid: number; high: number };
  /** Share of the time that's silence (below -60 dBFS). */
  silence: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** A biquad filter over a whole signal (direct form I). */
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** BS.1770 K-weighting at 48 kHz: a high shelf (the head's effect), then a high-pass. */
const kWeight = (x: Float32Array) =>
  biquad(
    biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585),
    1,
    -2,
    1,
    -1.99004745483398,
    0.99007225036621,
  );

/** A Butterworth biquad (RBJ cookbook), low- or high-pass; applied twice it's a steep 4th-order split. */
function butter(x: Float32Array, cutoff: number, rate: number, type: "low" | "high"): Float32Array {
  const w = (2 * Math.PI * cutoff) / rate,
    cos = Math.cos(w),
    alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b1 = (type === "low" ? 1 - cos : -(1 + cos)) / a0;
  const b0 = (type === "low" ? (1 - cos) / 2 : (1 + cos) / 2) / a0;
  const once = (v: Float32Array) => biquad(v, b0, b1, b0, (-2 * cos) / a0, (1 - alpha) / a0);
  return once(once(x));
}

const energy = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0);

/** Integrated loudness (LUFS) of channels at `rate`: 400 ms blocks every 100 ms, absolute gate -70, relative -10. */
export function loudness(channels: Float32Array[], rate = RENDER_RATE): number {
  const weighted = channels.map(kWeight);
  const block = Math.round(rate * 0.4),
    hop = Math.round(rate * 0.1);
  const blocks: number[] = [];
  for (let start = 0; start + block <= (weighted[0]?.length ?? 0); start += hop) {
    let sum = 0;
    for (const ch of weighted) {
      let s = 0;
      for (let i = start; i < start + block; i++) s += ch[i]! * ch[i]!;
      sum += s / block;
    }
    blocks.push(sum);
  }
  const lufsOf = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const loud = blocks.filter((ms) => ms > 0 && lufsOf(ms) > -70);
  if (!loud.length) return -Infinity;
  const relative = lufsOf(loud.reduce((a, b) => a + b, 0) / loud.length) - 10;
  const gated = loud.filter((ms) => lufsOf(ms) > relative);
  return lufsOf(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** Measure rendered audio: peak, clipping, loudness, spectrum balance and silence. */
export function analyse(channels: Float32Array[], rate = RENDER_RATE): Analysis {
  let peak = 0,
    clipped = 0,
    quiet = 0;
  const floor = 10 ** (-60 / 20);
  const n = channels[0]?.length ?? 0;
  for (let i = 0; i < n; i++) {
    let loudest = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i]!);
      if (v >= 1) clipped++;
      loudest = Math.max(loudest, v);
    }
    peak = Math.max(peak, loudest);
    if (loudest < floor) quiet++;
  }
  // Mono sum for the spectrum split.
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i]! += ch[i]! / channels.length;
  const total = energy(mono) || 1;
  const low = energy(butter(mono, 250, rate, "low"));
  const high = energy(butter(mono, 4000, rate, "high"));
  const mid = Math.max(0, total - low - high);
  const sum = low + mid + high || 1;
  return {
    peakDb: db(peak),
    clipped,
    lufs: loudness(channels, rate),
    bands: { low: low / sum, mid: mid / sum, high: high / sum },
    silence: n ? quiet / n : 1,
  };
}

/** Render `seconds` of a song offline (fast, silent) and return its channels. Only these instruments, if given. */
export async function render(song: Song, seconds: number, only?: string[]): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RENDER_RATE), RENDER_RATE);
  const solo: Song = only
    ? {
        ...song,
        sections: Object.fromEntries(
          Object.entries(song.sections).map(([name, tracks]) => [
            name,
            Object.fromEntries(Object.entries(tracks).filter(([inst]) => only.includes(inst))),
          ]),
        ),
      }
    : song;
  const player = new Player({ context: ctx as unknown as AudioContext });
  player.prerender(solo, seconds);
  const buf = await ctx.startRendering();
  return Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
}

export interface MixReport {
  /** The whole song. */
  song: Analysis;
  /** Each instrument on its own: its loudness, and how far it sits below the whole mix (LU). */
  tracks: Record<string, { lufs: number; belowMix: number }>;
  /** Plain-words problems worth fixing, empty if none. */
  warnings: string[];
}

/**
 * Render a song and each of its instruments, and say what's wrong with the mix, if anything: clipping, too loud or
 * too quiet, a track buried under the rest, a muddy low end or harsh highs. For agents and tests that can't listen.
 */
export async function mix(song: Song, seconds = 20): Promise<MixReport> {
  const whole = analyse(await render(song, seconds));
  const tracks: MixReport["tracks"] = {};
  for (const inst of Object.keys(song.instruments)) {
    const l = loudness(await render(song, seconds, [inst]));
    tracks[inst] = { lufs: l, belowMix: whole.lufs - l };
  }
  const warnings: string[] = [];
  if (whole.clipped > 0) warnings.push(`clipping: ${whole.clipped} samples at full scale; lower the volumes`);
  if (whole.lufs > -10) warnings.push(`loud: ${whole.lufs.toFixed(1)} LUFS; aim for about -16 so sound effects sit on top`);
  if (whole.lufs < -24) warnings.push(`quiet: ${whole.lufs.toFixed(1)} LUFS; aim for about -16`);
  for (const [inst, t] of Object.entries(tracks)) {
    if (!Number.isFinite(t.lufs)) warnings.push(`${inst}: silent; does any section play it?`);
    else if (t.belowMix > 20) warnings.push(`${inst}: buried (${t.belowMix.toFixed(0)} LU under the mix); raise its volume`);
  }
  if (whole.bands.low > 0.7) warnings.push(`muddy: ${Math.round(whole.bands.low * 100)}% of the energy is under 250 Hz`);
  if (whole.bands.high > 0.25) warnings.push(`harsh: ${Math.round(whole.bands.high * 100)}% of the energy is over 4 kHz`);
  return { song: whole, tracks, warnings };
}
