import type { Game } from "@debuffjp/core";
import { ClipRecorder } from "@debuffjp/share";

/** Dev-server endpoint that writes a capture into `.debuff/captures/` (see `@debuffjp/cli`). */
export const CAPTURE_ENDPOINT = "/__debuff/capture";

/** How long a dev clip can be, in seconds: a clip is between half and all of this once recording has run that long. */
export const CLIP_SECONDS = 15;

/**
 * MP4 first: X and most stores take MP4 (H.264) and not WebM. Chrome records MP4 directly; Firefox only
 * WebM, which needs converting before posting (`ffmpeg -i clip.webm clip.mp4`).
 */
const DEV_TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export interface ClipStatus {
  /** False where this browser can't record a canvas. */
  supported: boolean;
  recording: boolean;
  /** Longest clip a save returns, in seconds. */
  seconds: number;
  mimeType: string | null;
}

export interface SavedCapture {
  /** Path relative to the project root, e.g. `.debuff/captures/clip-1730.mp4`; undefined when downloaded instead. */
  file: string | undefined;
  /** Approximate length in seconds (clips only). */
  seconds?: number;
  bytes: number;
  mimeType: string;
}

/**
 * Rolling clip recording for the dev panel and agents: the last few seconds of the game canvas, saved
 * into the project for devlogs, store pages and press kits. Recording runs two encoders, so it is off
 * until someone turns it on. The dev panel is DOM, so it never shows up in a clip.
 */
export class DevClips {
  private recorder: ClipRecorder | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly game: Game) {}

  status(): ClipStatus {
    const mimeType = ClipRecorder.supported(DEV_TYPES);
    return {
      supported: mimeType !== undefined,
      recording: this.recorder?.recording ?? false,
      seconds: CLIP_SECONDS,
      mimeType: mimeType ?? null,
    };
  }

  /** Start or stop the rolling recording. */
  set(on: boolean): ClipStatus {
    if (on && !this.recorder?.recording) {
      const recorder = new ClipRecorder(this.game.canvas, { seconds: CLIP_SECONDS, mimeTypes: DEV_TYPES });
      if (!recorder.start()) throw new Error("This browser can't record the canvas (no MediaRecorder or captureStream)");
      this.recorder = recorder;
    } else if (!on && this.recorder) {
      this.recorder.stop();
      this.recorder = undefined;
    }
    this.changed();
    return this.status();
  }

  /** Save the recent past as a video. Recording carries on. */
  async save(name = `clip-${Date.now()}`): Promise<SavedCapture> {
    const clip = await this.recorder?.clip();
    if (!clip) throw new Error("Clip recording is off: turn it on first (dev panel: rec, or clips(true))");
    const saved = await saveCapture(clip.blob, name, clip.extension);
    return { ...saved, seconds: Math.round(clip.seconds * 10) / 10 };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  dispose(): void {
    this.recorder?.stop();
    this.recorder = undefined;
    this.listeners.clear();
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}

/**
 * Write a capture into the project through the dev server, or download it when the page isn't served by
 * `debuff dev` (the endpoint answers 404).
 */
export async function saveCapture(blob: Blob, rawName: string, extension: string): Promise<SavedCapture> {
  const name = rawName.replace(/[^\w-]+/g, "-").slice(0, 80) || "capture";
  const mimeType = blob.type || (extension === "png" ? "image/png" : `video/${extension}`);
  try {
    const res = await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, extension, data: await base64(blob) }),
    });
    if (res.ok) {
      const body = (await res.json()) as { file: string };
      return { file: body.file, bytes: blob.size, mimeType };
    }
    if (res.status !== 404) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // TypeError: no dev server at all (file://, static host)
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${name}.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { file: undefined, bytes: blob.size, mimeType };
}

/** Size presets for stills: `social` is 1200×675 (16:9), what X and Bluesky show for an image or link card. */
export const STILL_SIZES = { social: [1200, 675] } as const;

/**
 * The current frame drawn into a `width` × `height` PNG, letterboxed on `background`. Scaled up by whole
 * pixels without smoothing so pixel art stays crisp, and scaled down smoothly when the game is larger.
 */
export function fitFrame(game: Game, width: number, height: number, background = "#000000"): string {
  if (!(width >= 1 && height >= 1 && width * height <= 16_000_000)) throw new RangeError("capture: width and height must be at least 1");
  game.redraw();
  const src = game.canvas;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("capture: a 2D canvas is unavailable");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const fitScale = Math.min(width / src.width, height / src.height);
  const scale = fitScale >= 1 ? Math.floor(fitScale) : fitScale;
  ctx.imageSmoothingEnabled = scale < 1;
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  ctx.drawImage(src, Math.floor((width - w) / 2), Math.floor((height - h) / 2), w, h);
  return out.toDataURL("image/png");
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
