export interface ClipOptions {
  /** Longest clip, in seconds. Clips are always at least half this long once recording has run that long. Default 12. */
  seconds?: number;
  /** Capture frame rate. Default 30. */
  fps?: number;
  /** Video bitrate in bits per second. Default 4 Mbps. */
  bitrate?: number;
  /** Preferred container types, first supported wins. Default webm (VP9, then VP8), then mp4. */
  mimeTypes?: string[];
}

export interface Clip {
  blob: Blob;
  mimeType: string;
  /** Suggested file extension without the dot, e.g. `webm`. */
  extension: string;
  /** Approximate length in seconds. */
  seconds: number;
}

const DEFAULT_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

interface Slot {
  recorder: MediaRecorder;
  chunks: Blob[];
  started: number;
}

/**
 * Rolling recorder for the last few seconds of a canvas, for "share that moment" buttons.
 *
 * A WebM file can't be trimmed by dropping its early chunks, so two recorders run staggered by half the
 * window and restart every window. `clip()` keeps whichever has run longer, so a clip is between half and
 * all of `seconds` long. That costs two encoders while recording: start it when a run begins, not on load.
 *
 * ```ts
 * const clips = new ClipRecorder(game.canvas);
 * clips.start();
 * // later, on a big moment or a "share" button
 * const clip = await clips.clip();
 * if (clip) await share({ text: "12x combo!", files: [clipFile(clip, "squish")] });
 * ```
 */
export class ClipRecorder {
  readonly mimeType: string | undefined;
  private readonly seconds: number;
  private readonly fps: number;
  private readonly bitrate: number;
  private stream: MediaStream | undefined;
  private slots: (Slot | undefined)[] = [undefined, undefined];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private now: () => number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: ClipOptions = {},
  ) {
    this.seconds = options.seconds ?? 12;
    this.fps = options.fps ?? 30;
    this.bitrate = options.bitrate ?? 4_000_000;
    this.mimeType = ClipRecorder.supported(options.mimeTypes);
    this.now = () => performance.now();
  }

  /** First supported clip type, or `undefined` where this browser can't record a canvas. */
  static supported(types: string[] = DEFAULT_TYPES): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return undefined;
    if (!("captureStream" in HTMLCanvasElement.prototype)) return undefined;
    return types.find((t) => MediaRecorder.isTypeSupported(t));
  }

  get recording(): boolean {
    return this.stream !== undefined;
  }

  /** Start recording. Returns false (and does nothing) where clips aren't supported. */
  start(): boolean {
    if (this.stream) return true;
    if (!this.mimeType) return false;
    this.stream = this.canvas.captureStream(this.fps);
    this.cycle(0);
    this.timers.push(setTimeout(() => this.cycle(1), (this.seconds * 1000) / 2));
    return true;
  }

  /** Stop recording and drop anything buffered. */
  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const slot of this.slots) if (slot && slot.recorder.state !== "inactive") slot.recorder.stop();
    this.slots = [undefined, undefined];
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
  }

  /** The recent past as a video, or `undefined` if not recording. Recording carries on afterwards. */
  async clip(): Promise<Clip | undefined> {
    const at = this.now();
    const live = this.slots.filter((s): s is Slot => s !== undefined);
    if (!live.length || !this.mimeType) return undefined;
    const oldest = live.reduce((a, b) => (a.started <= b.started ? a : b));
    const index = this.slots.indexOf(oldest);
    const mimeType = this.mimeType;
    const blob = await new Promise<Blob>((resolve) => {
      oldest.recorder.onstop = () => resolve(new Blob(oldest.chunks, { type: mimeType.split(";")[0] ?? mimeType }));
      oldest.recorder.stop();
    });
    // Restart the slot we took so the rolling window keeps going.
    if (this.stream) this.cycle(index);
    return { blob, mimeType, extension: mimeType.includes("mp4") ? "mp4" : "webm", seconds: (at - oldest.started) / 1000 };
  }

  private cycle(index: number): void {
    if (!this.stream || !this.mimeType) return;
    const previous = this.slots[index];
    if (previous && previous.recorder.state !== "inactive") {
      previous.recorder.onstop = null;
      previous.recorder.stop();
    }
    const recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType, videoBitsPerSecond: this.bitrate });
    const slot: Slot = { recorder, chunks: [], started: this.now() };
    recorder.ondataavailable = (e) => {
      if (e.data.size) slot.chunks.push(e.data);
    };
    recorder.start(1000);
    this.slots[index] = slot;
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      this.cycle(index);
    }, this.seconds * 1000);
    this.timers.push(timer);
  }
}

/** Wrap a clip as a `File` for `share({ files })` or a download. */
export function clipFile(clip: Clip, name = "clip"): File {
  return new File([clip.blob], `${name}.${clip.extension}`, { type: clip.blob.type });
}
