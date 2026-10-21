// Plays songs through Web Audio. Notes are scheduled a little ahead on the audio clock (not on frames), so timing
// stays tight even when the game drops a frame or the tab is busy.

import { type Instrument, type NoteEvent, notes, type Song, stepSeconds } from "./song.js";

export interface PlayerOptions {
  /** The audio context to use. Default: a new one. */
  context?: AudioContext;
  /** Where the music goes (a game's music bus, say). Default: the context's speakers. */
  destination?: AudioNode;
}

export interface PlayOptions {
  /** Fade in over this many seconds. */
  fade?: number;
  /** Start from this step (sixteenth notes) instead of the top. */
  at?: number;
}

const LOOKAHEAD = 0.15; // seconds of notes scheduled ahead
const TICK_MS = 40; // how often the scheduler wakes up

export class Player {
  readonly context: AudioContext;
  private readonly out: GainNode;
  private readonly echoIn: GainNode;
  private noiseBuffer: AudioBuffer | undefined;
  private song: Song | undefined;
  /** Audio-clock time of step 0 of the current song, adjusted when the tempo changes. */
  private origin = 0;
  /** Next step to schedule. */
  private nextStep = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private tempoScale = 1;
  private readonly layers = new Map<string, GainNode>();
  /** Every note scheduled, for tests and agents (the most recent 256). */
  readonly played: NoteEvent[] = [];

  constructor(options: PlayerOptions = {}) {
    this.context = options.context ?? new AudioContext();
    this.out = this.context.createGain();
    this.out.connect(options.destination ?? this.context.destination);
    // A soft echo, shared by every instrument that asks for one.
    this.echoIn = this.context.createGain();
    const delay = this.context.createDelay(1);
    const feedback = this.context.createGain();
    const wet = this.context.createGain();
    feedback.gain.value = 0.35;
    wet.gain.value = 0.5;
    this.echoIn.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.out);
    this.delay = delay;
  }

  private readonly delay: DelayNode;

  /** Is a song playing? */
  get playing(): boolean {
    return this.timer !== undefined;
  }

  /** Play a song from the top (or `at` a step), looping. Replaces whatever was playing. */
  play(song: Song, options: PlayOptions = {}): void {
    this.stop();
    void this.context.resume();
    this.song = song;
    this.tempoScale = 1;
    // Echo in time with the music: a dotted eighth.
    this.delay.delayTime.value = Math.min(1, stepSeconds(song.bpm) * 3);
    const now = this.context.currentTime + 0.05;
    this.nextStep = options.at ?? 0;
    this.origin = now - this.nextStep * stepSeconds(song.bpm);
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(options.fade ? 0.0001 : 1, now);
    if (options.fade) g.exponentialRampToValueAtTime(1, now + options.fade);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** Stop, fading out over `fade` seconds (default: at once). */
  stop(fade = 0): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    const now = this.context.currentTime,
      g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value || 0.0001, now);
    if (fade > 0) g.exponentialRampToValueAtTime(0.0001, now + fade);
    else g.setValueAtTime(0.0001, now);
    for (const layer of this.layers.values()) layer.disconnect();
    this.layers.clear();
  }

  /**
   * Speed up or slow down (1 = the song's own bpm), without a jump: the next notes simply come sooner or later. For
   * music that tightens as the moves run out, say.
   */
  tempo(scale: number): void {
    if (!this.song || scale <= 0) return;
    const now = this.context.currentTime;
    const oldStep = stepSeconds(this.song.bpm) / this.tempoScale,
      newStep = stepSeconds(this.song.bpm) / scale;
    const at = (now - this.origin) / oldStep; // where we are, in steps
    this.origin = now - at * newStep;
    this.tempoScale = scale;
  }

  /** Fade one instrument's track in or out (0-1) over `fade` seconds: layers that come and go with the game. */
  layer(instrument: string, volume: number, fade = 0.5): void {
    const g = this.layerGain(instrument).gain,
      now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + Math.max(0.01, fade));
  }

  private layerGain(instrument: string): GainNode {
    let g = this.layers.get(instrument);
    if (!g) {
      g = this.context.createGain();
      g.connect(this.out);
      this.layers.set(instrument, g);
    }
    return g;
  }

  /** Schedule every note due before the lookahead runs out. */
  private schedule(): void {
    const song = this.song;
    if (!song) return;
    const step = stepSeconds(song.bpm) / this.tempoScale;
    const until = this.context.currentTime + LOOKAHEAD;
    const last = Math.floor((until - this.origin) / step) + 1;
    if (last <= this.nextStep) return;
    // notes() works in the song's own time; rescale to the current tempo.
    const scale = stepSeconds(song.bpm) / step;
    for (const n of notes(song, this.nextStep, last)) {
      const instrument = song.instruments[n.instrument];
      if (!instrument) continue;
      const when = this.origin + n.time / scale;
      if (when < this.context.currentTime - 0.01) continue;
      this.voice(instrument, n.instrument, n.freq, when, n.duration / scale, n.velocity);
      this.played.push(n);
      if (this.played.length > 256) this.played.shift();
    }
    this.nextStep = last;
  }

  private noise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, len, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      // A fixed seed, so drums sound the same every time.
      let s = 0x2545f491;
      for (let i = 0; i < len; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
      }
    }
    return this.noiseBuffer;
  }

  /** Build and start one note. */
  private voice(inst: Instrument, name: string, freq: number, when: number, length: number, velocity: number): void {
    const ctx = this.context;
    const attack = inst.attack ?? 0.005,
      decay = inst.decay ?? 0.1,
      sustain = inst.sustain ?? 0.6,
      release = inst.release ?? 0.08;
    const peak = (inst.volume ?? 0.3) * velocity;
    const end = when + Math.max(length, attack + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), when + attack + decay);
    env.gain.setValueAtTime(Math.max(0.0001, peak * sustain), end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + release);
    let head: AudioNode = env;
    if (inst.filter) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = inst.filter.q ?? 1;
      const base = inst.filter.cutoff;
      if (inst.filter.sweep) {
        f.frequency.setValueAtTime(base + inst.filter.sweep, when);
        f.frequency.exponentialRampToValueAtTime(base, when + attack + decay);
      } else f.frequency.value = base;
      f.connect(env);
      head = f;
    }
    env.connect(this.layerGain(name));
    if (inst.echo) {
      const send = ctx.createGain();
      send.gain.value = inst.echo;
      env.connect(send).connect(this.echoIn);
    }
    const stopAt = end + release + 0.05;
    if ((inst.wave ?? "square") === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      src.connect(head);
      src.start(when);
      src.stop(stopAt);
      return;
    }
    const pitch = freq * 2 ** (inst.octave ?? 0);
    const oscs = [0, ...(inst.detune ? [inst.detune] : [])].map((cents) => {
      const o = ctx.createOscillator();
      o.type = (inst.wave ?? "square") as OscillatorType;
      o.detune.value = cents;
      if (inst.drop) {
        o.frequency.setValueAtTime(pitch * 2 ** (inst.drop / 12), when);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, pitch), when + Math.min(0.12, attack + decay));
      } else o.frequency.setValueAtTime(pitch, when);
      o.connect(head);
      o.start(when);
      o.stop(stopAt);
      return o;
    });
    if (inst.vibrato) {
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = inst.vibrato;
      lfo.connect(depth);
      for (const o of oscs) depth.connect(o.detune);
      lfo.start(when);
      lfo.stop(stopAt);
    }
  }
}
