/** Web Audio facade: decoded buffers, music/sfx buses, autoplay unlock, and a tiny
 *  parametric synth for placeholder blips. Music and sound effects made in code go through plonk (`plonkjs`) on
 *  `bus("music")`. */
export type Bus = "sfx" | "music";

export interface PlayOptions {
  bus?: Bus;
  volume?: number;
  /** Playback rate; 1 = original pitch. */
  rate?: number;
  /** Random ± variation added to rate, for less repetitive SFX. */
  rateJitter?: number;
  /** Stereo pan in [-1, 1]. */
  pan?: number;
  loop?: boolean;
}

export interface Voice {
  stop(fadeSeconds?: number): void;
}

export interface StreamOptions {
  /** Default "music". */
  bus?: Bus;
  volume?: number;
  /** Default true. */
  loop?: boolean;
}

/** A streamed track. `stop()` is final: it unloads the track, and `pause()`/`resume()` do nothing after it. */
export interface Stream extends Voice {
  readonly element: HTMLAudioElement;
  pause(): void;
  /** Carry on after `pause()`. Does nothing after `stop()` (before 0.31.1 it restarted a stopping track). */
  resume(): void;
  volume(value: number, fadeSeconds?: number): void;
}

export interface SynthOptions {
  wave?: OscillatorType | "noise";
  /** Start and end frequency in Hz (exponential slide). */
  freq: number;
  freqEnd?: number;
  attack?: number;
  decay: number;
  volume?: number;
  bus?: Bus;
}

export class Audio {
  readonly ctx: AudioContext;
  private readonly buses: Record<Bus, GainNode>;
  private readonly master: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private noise: AudioBuffer | undefined;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buses = { sfx: this.ctx.createGain(), music: this.ctx.createGain() };
    this.buses.sfx.connect(this.master);
    this.buses.music.connect(this.master);
    // Browsers start the context suspended until a user gesture, and can suspend it again later (iOS does
    // on a phone call or an app switch, as "interrupted"). Every gesture resumes it unless it's running.
    const unlock = () => {
      if (this.ctx.state !== "running" && this.ctx.state !== "closed") void this.ctx.resume();
    };
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
  }

  /**
   * A bus's gain node, to plug other audio in (a music generator such as plonk: `new Player({ context: audio.ctx,
   * destination: audio.bus("music") })`), so it shares the game's volume and mute.
   */
  bus(name: Bus): GainNode {
    return this.buses[name];
  }

  get unlocked(): boolean {
    return this.ctx.state === "running";
  }

  async decode(id: string, data: ArrayBuffer): Promise<void> {
    // decodeAudioData detaches its input; copy so the asset cache stays usable.
    this.buffers.set(id, await this.ctx.decodeAudioData(data.slice(0)));
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  /** A decoded sound, to play through your own nodes (a positional audio plugin, say). */
  buffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  play(id: string, options: PlayOptions = {}): Voice {
    const buffer = this.buffers.get(id);
    if (!buffer) throw new Error(`Audio "${id}" not decoded. Call audio.decode("${id}", assets.audio("${id}")) first.`);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = options.loop ?? false;
    src.playbackRate.value = (options.rate ?? 1) + (options.rateJitter ?? 0) * (Math.random() * 2 - 1);
    const gain = this.ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = options.pan ?? 0;
    src
      .connect(gain)
      .connect(pan)
      .connect(this.buses[options.bus ?? "sfx"]);
    src.start();
    return this.voice(src, gain);
  }

  /**
   * Synthesize a short blip/zap/hit without any asset: one oscillator with a pitch slide, for a placeholder until
   * the game has its sound. For sound effects a game keeps, use plonk's `player.sfx(instrument, { degree })`, which
   * plays in the song's key (see `bus`).
   */
  synth(o: SynthOptions): Voice {
    const t = this.ctx.currentTime;
    const attack = o.attack ?? 0.005;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(o.volume ?? 0.3, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
    gain.connect(this.buses[o.bus ?? "sfx"]);
    let src: AudioScheduledSourceNode;
    if (o.wave === "noise") {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer();
      // The buffer is a second long: loop it so long sounds keep going until their stop time.
      n.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), t + attack + o.decay);
      n.connect(filter).connect(gain);
      src = n;
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = o.wave ?? "square";
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), t + attack + o.decay);
      osc.connect(gain);
      src = osc;
    }
    src.start(t);
    src.stop(t + attack + o.decay + 0.05);
    return this.voice(src, gain);
  }

  /**
   * Stream a long track (music, ambience) through an `<audio>` element into a bus. Unlike `play`, it
   * isn't decoded into memory up front, so it starts immediately and stays light on mobile.
   * If audio is still locked by the browser's autoplay policy, playback starts on the first gesture.
   */
  stream(url: string, options: StreamOptions = {}): Stream {
    const el = new globalThis.Audio();
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.loop = options.loop ?? true;
    el.src = url;
    const gain = this.ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    this.ctx
      .createMediaElementSource(el)
      .connect(gain)
      .connect(this.buses[options.bus ?? "music"]);
    let state: "playing" | "paused" | "stopped" = "playing";
    // A blocked play() waits for the next chance: the context unlocking, or a user gesture (media elements
    // have their own autoplay rules, so the context can already be running while the element is blocked).
    // Only one wait is armed at a time, however often the stream is paused and resumed meanwhile.
    let retry: AbortController | undefined;
    const disarm = () => {
      retry?.abort();
      retry = undefined;
    };
    const start = () => {
      if (state !== "playing") return;
      el.play().catch(() => {
        if (state !== "playing" || retry) return;
        retry = new AbortController();
        const again = () => {
          disarm();
          start();
        };
        const opts = { once: true, signal: retry.signal };
        this.ctx.addEventListener("statechange", again, opts);
        addEventListener("pointerdown", again, opts);
        addEventListener("keydown", again, opts);
      });
    };
    start();
    return {
      element: el,
      pause: () => {
        if (state === "stopped") return;
        state = "paused";
        disarm();
        el.pause();
      },
      resume: () => {
        // stop() is final: it unloads the element. Call stream() again to play the track afresh.
        if (state !== "paused") return;
        state = "playing";
        start();
      },
      volume: (value, fadeSeconds = 0) => {
        if (fadeSeconds > 0) gain.gain.setTargetAtTime(value, this.ctx.currentTime, fadeSeconds / 3);
        else gain.gain.value = value;
      },
      stop: (fadeSeconds = 0) => {
        if (state === "stopped") return;
        state = "stopped";
        disarm();
        const end = () => {
          el.pause();
          el.removeAttribute("src");
          el.load();
        };
        if (fadeSeconds <= 0) return end();
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeSeconds / 3);
        setTimeout(end, fadeSeconds * 1000);
      },
    };
  }

  volume(bus: Bus | "master", value: number): void {
    const node = bus === "master" ? this.master : this.buses[bus];
    node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  private voice(src: AudioScheduledSourceNode, gain: GainNode): Voice {
    return {
      stop: (fade = 0) => {
        const t = this.ctx.currentTime;
        if (fade > 0) {
          gain.gain.setTargetAtTime(0, t, fade / 3);
          src.stop(t + fade);
        } else src.stop();
      },
    };
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}
