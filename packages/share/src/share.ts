export interface ShareData {
  title?: string;
  text?: string;
  /** Defaults to the current page. */
  url?: string;
  /** Clips or screenshots. Dropped where the share sheet can't take files. */
  files?: File[];
}

/** How a `share()` call ended. */
export type ShareResult = "shared" | "copied" | "cancelled" | "unsupported";

/**
 * Share with the system share sheet where there is one (phones, most desktops), otherwise copy the text
 * and link to the clipboard. Call it from a click or key handler: browsers only allow it after user input.
 */
export async function share(data: ShareData): Promise<ShareResult> {
  const url = data.url ?? location.href;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share) {
    const payload: ShareData = { url };
    if (data.title !== undefined) payload.title = data.title;
    if (data.text !== undefined) payload.text = data.text;
    if (data.files?.length && nav.canShare?.({ files: data.files })) payload.files = data.files;
    try {
      await nav.share(payload);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Some browsers expose share() but refuse it (permissions policy, iframes): fall through to copy.
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText([data.text, url].filter(Boolean).join(" "));
      return "copied";
    } catch {
      // Clipboard blocked too.
    }
  }
  return "unsupported";
}

/** Save a blob (a clip, a screenshot) as a file download. */
export function download(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/** The canvas as it is now, as a PNG. Call it right after a frame renders (e.g. in `onRender`). */
export function screenshot(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), "image/png"));
}
