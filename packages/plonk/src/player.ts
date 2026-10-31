// Plays songs through Web Audio. Notes are scheduled a little ahead on the audio clock (not on frames), so timing
// stays tight even when the game drops a frame or the tab is busy.
//
// The signal path: every voice -> its track's layer gain -> the music bus (faded by play/stop) -> the master bus.
// Sound effects from sfx() skip the music bus, so they play even when the music is faded out. The echo and reverb
// are shared sends. The master bus glues everything with a gentle compressor, then a limiter so it never clips.

import { chord, degree, frequency, type Instrument, type NoteEvent, notes, type Song, songSteps, stepSeconds } from "./song.js";

export interface PlayerOptions {
  /** The audio context to use. Default: a new one. */
  context?: AudioContext;
  /** Where everything goes (a game's music bus, say). Default: the context's speakers. */
  destination?: AudioNode;
  /** Glue the mix with a compressor and stop it clipping with a limiter. Default true. */
  master?: boolean;
}

export interface PlayOptions {
  /** Fade in over this many seconds. */
  fade?: number;
  /** Start from this step (sixteenth notes) instead of the top. */
  at?: number;
}

/** A one-shot sound effect from sfx(). */
export interface SfxOptions {
  /** Scale degree in the song's key (1 = the root, 8 = an octave up). The usual way to stay in tune with the music. */
  degree?: number;
  /** Octave for `degree` (default 4), or for nothing else. */
  octave?: number;
  /** Or a note name ("C5"), a chord name ("Am7@4"), or a frequency in Hz. */
  note?: string;
  freq?: number;
  /** Wait for the next step, beat or bar of the music, so the sound lands in time. Default: play now. */
  quantize?: "step" | "beat" | "bar";
  /** Then wait this many steps more (sixteenth notes of the song, or of 120 bpm with none playing): for jingles. */
  after?: number;
  /** 0-1. Default 0.8. */
  velocity?: number;
  /** Seconds. Default: the instrument's attack plus decay. */
  length?: number;
}

const LOOKAHEAD = 0.15; // seconds of notes scheduled ahead
const TICK_MS = 40; // how often the scheduler wakes up

export class Player {
  readonly context: AudioContext;
  /** The music bus: play() fades it in, stop() fades it out. */
  private readonly out: GainNode;
  private readonly master: AudioNode;
  private readonly echoIn: GainNode;
  private readonly reverbIn: GainNode;
  private readonly delay: DelayNode;
  private noiseBuffer: AudioBuffer | undefined;
  private song: Song | undefined;
  /** Audio-clock time of step 0 of the current song, adjusted when the tempo changes. */
  private origin = 0;
  /** Next step to schedule. */
  private nextStep = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private tempoScale = 1;
  private readonly layers = new Map<string, GainNode>();
  /** Every note scheduled (music and sound effects), for tests and agents: the most recent 256. */
  readonly played: NoteEvent[] = [];

  constructor(options: PlayerOptions = {}) {
    this.context = options.context ?? new AudioContext();
    const ctx = this.context;
    const destination = options.destination ?? ctx.destination;
    // Master: a gentle compressor to glue the mix, then a limiter so it can't clip.
    if (options.master === false) this.master = destination;
    else {
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -18;
      glue.knee.value = 12;
      glue.ratio.value = 3;
      glue.attack.value = 0.01;
      glue.release.value = 0.25;
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -2;
      limit.knee.value = 0;
      limit.ratio.value = 20;
      limit.attack.value = 0.002;
      limit.release.value = 0.1;
      glue.connect(limit).connect(destination);
      this.master = glue;
    }
    this.out = ctx.createGain();
    this.out.connect(this.master);
    // A soft echo, shared by every instrument that asks for one.
    this.echoIn = ctx.createGain();
    this.delay = ctx.createDelay(1);
    const feedback = ctx.createGain(),
      echoWet = ctx.createGain();
    feedback.gain.value = 0.35;
    echoWet.gain.value = 0.5;
    this.echoIn.connect(this.delay);
    this.delay.connect(feedback).connect(this.delay);
    this.delay.connect(echoWet).connect(this.master);
    // A small room: a seeded, decaying noise impulse.
    this.reverbIn = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = this.impulse(1.6);
    const roomWet = ctx.createGain();
    roomWet.gain.value = 0.6;
    this.reverbIn.connect(room).connect(roomWet).connect(this.master);
  }

  /** Is a song playing? */
  get playing(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Where the music is now, in steps (sixteenth notes) from the top of the song: fractional, counting up across
   * loops, and following `tempo()`. -1 when nothing is playing. Read it each frame to move things in time with
   * the music: `Math.floor(player.step) % 4 === 0` is the beat, `player.step % 16` the place in a bar.
   */
  get step(): number {
    if (this.timer === undefined || !this.song) return -1;
    return Math.max(0, (this.context.currentTime - this.origin) / (stepSeconds(this.song.bpm) / this.tempoScale));
  }

  /**
   * Play a song from the top (or `at` a step), looping. Replaces whatever was playing. Throws here, before
   * anything changes, if a pattern has a step plonk can't read.
   */
  play(song: Song, options: PlayOptions = {}): void {
    songSteps(song);
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

  /**
   * @internal For offline rendering (see `render`): schedule `seconds` of a song from time 0 in one go, since an
   * offline context's clock doesn't run until it renders.
   */
  prerender(song: Song, seconds: number): void {
    this.song = song;
    this.tempoScale = 1;
    this.delay.delayTime.value = Math.min(1, stepSeconds(song.bpm) * 3);
    this.origin = 0.01;
    this.out.gain.setValueAtTime(1, 0);
    const last = Math.ceil(seconds / stepSeconds(song.bpm)) + 1;
    for (const n of notes(song, 0, last)) {
      const instrument = song.instruments[n.instrument];
      if (!instrument || n.time >= seconds) continue;
      this.voice(instrument, this.layerGain(n.instrument), n.freq, this.origin + n.time, n.duration, n.velocity);
      this.record(n);
    }
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

  /**
   * Play a one-shot sound effect with an instrument, in the music's key and, if asked, on its beat. A pop on scale
   * degree 1, then 2, 3... for each step of a combo climbs the song's scale instead of clashing with it. Returns when
   * (on the audio clock) it plays.
   */
  sfx(instrument: Instrument, options: SfxOptions = {}): number {
    const ctx = this.context,
      now = ctx.currentTime;
    let when = now;
    if (options.quantize && this.song && this.playing) {
      const step = stepSeconds(this.song.bpm) / this.tempoScale;
      const every = options.quantize === "bar" ? 16 : options.quantize === "beat" ? 4 : 1;
      const at = (now - this.origin) / step;
      when = this.origin + Math.ceil(at / every - 1e-6) * every * step;
    }
    if (options.after) when += options.after * (stepSeconds(this.song?.bpm ?? 120) / this.tempoScale);
    const shift = 2 ** ((this.song?.transpose ?? 0) / 12);
    const freqs =
      options.freq !== undefined
        ? [options.freq]
        : options.note
          ? (chord(options.note) ?? [frequency(options.note) ?? 440])
          : [degree(this.song?.key, options.degree ?? 1, options.octave ?? 4) * shift];
    const length = options.length ?? (instrument.attack ?? 0.005) + (instrument.decay ?? 0.1);
    for (const freq of freqs) {
      this.voice(instrument, this.master, freq, when, length, options.velocity ?? 0.8);
      this.record({ time: when, instrument: "sfx", freq, duration: length, velocity: options.velocity ?? 0.8 });
    }
    return when;
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

  private record(n: NoteEvent): void {
    this.played.push(n);
    if (this.played.length > 256) this.played.shift();
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
      this.voice(instrument, this.layerGain(n.instrument), n.freq, when, n.duration / scale, n.velocity);
      this.record(n);
    }
    this.nextStep = last;
  }

  /** A seeded noise source, shared by every drum. */
  private noise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, len, this.context.sampleRate);
      fillNoise(this.noiseBuffer.getChannelData(0), 0x2545f491, () => 1);
    }
    return this.noiseBuffer;
  }

  /** A reverb impulse: stereo noise fading out over `seconds`, seeded so the room sounds the same every time. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.context.sampleRate,
      len = Math.max(1, Math.floor(rate * seconds));
    const buf = this.context.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) fillNoise(buf.getChannelData(c), 0x51ed270b + c, (i) => (1 - i / len) ** 3);
    return buf;
  }

  /** Build and start one note, into `into`. */
  private voice(inst: Instrument, into: AudioNode, freq: number, when: number, length: number, velocity: number): void {
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
    let tail: AudioNode = env;
    if (inst.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, inst.pan));
      env.connect(p);
      tail = p;
    }
    tail.connect(into);
    if (inst.echo) {
      const send = ctx.createGain();
      send.gain.value = inst.echo;
      tail.connect(send).connect(this.echoIn);
    }
    if (inst.reverb) {
      const send = ctx.createGain();
      send.gain.value = inst.reverb;
      tail.connect(send).connect(this.reverbIn);
    }
    const stopAt = end + release + 0.05;
    if ((inst.wave ?? "square") === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      // The buffer is a second long: loop it so long notes keep sounding until their stop time.
      src.loop = true;
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

/** Fill with seeded white noise (xorshift), shaped by `envelope(i)`. */
function fillNoise(data: Float32Array, seed: number, envelope: (i: number) => number): void {
  let s = seed | 0;
  for (let i = 0; i < data.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    data[i] = (((s >>> 0) / 4294967296) * 2 - 1) * envelope(i);
  }
}
