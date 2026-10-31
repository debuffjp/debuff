// Launch metadata that `debuff build` adds to dist/: link-preview cards (Open Graph and Twitter), a web app
// manifest so the game installs to a home screen, and a preview image. Every game gets shareable links
// without anyone remembering which meta tags crawlers want.
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

/** `launch` in `debuff.config.ts`. Everything is optional; names fall back to package.json. */
export interface LaunchConfig {
  /** Game name. Default: the page's `<title>`, then package.json `name`. */
  title?: string;
  /** One or two sentences for link previews and stores. Default: package.json `description`. */
  description?: string;
  /** Where the game will live, e.g. `https://you.itch.io/game`. Link previews need it for an absolute image URL. */
  url?: string;
  /** Preview image (PNG or JPG, ideally 1200×630), relative to the project root. Default: the first scenario baseline. */
  image?: string;
  /** Looping preview clip (MP4, H.264, silent, a few seconds), relative to the project root. Players like Discord play it inline. */
  video?: string;
  /** Square icon (PNG, 512×512 is best), relative to the project root, for the web app manifest. */
  icon?: string;
  /** Browser UI colour. Default: `background`. */
  themeColor?: string;
  /** Splash colour while the installed game opens. Default `#000000`. */
  background?: string;
  /** Web app display mode. Default `fullscreen`. */
  display?: "fullscreen" | "standalone" | "minimal-ui" | "browser";
  /** Screen orientation for the installed game. */
  orientation?: "any" | "landscape" | "portrait";
  /** Credit for the press kit, e.g. a studio name. */
  author?: string;
  /** Links for the press kit: store pages, socials, Discord. */
  links?: Record<string, string>;
  /** `false` turns off everything `debuff build` adds here. */
  enabled?: boolean;
}

export interface LaunchInfo {
  title: string;
  description: string | undefined;
  config: LaunchConfig;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function launchInfo(root: string, config: LaunchConfig = {}): LaunchInfo {
  let pkg: { name?: string; description?: string } = {};
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {}
  return { title: config.title ?? pkg.name ?? basename(root), description: config.description ?? pkg.description, config };
}

/** Scenario baselines, newest scenario order: the frames `debuff scenario` already renders deterministically. */
export function baselineImages(root: string): string[] {
  const dir = join(root, "scenarios", "__baselines__");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".png") && !name.includes(".diff.") && !name.includes(".actual.")) out.push(path);
    }
  };
  walk(dir);
  return out;
}

/** Width and height from an MP4's first track header (moov > trak > tkhd), or undefined if it has none. */
export function mp4Size(data: Buffer): { width: number; height: number } | undefined {
  const find = (start: number, end: number, type: string): [number, number] | undefined => {
    for (let at = start; at + 8 <= end; ) {
      const size = data.readUInt32BE(at);
      if (size < 8) return undefined;
      if (data.toString("latin1", at + 4, at + 8) === type) return [at + 8, Math.min(at + size, end)];
      at += size;
    }
    return undefined;
  };
  const moov = find(0, data.length, "moov");
  const trak = moov && find(...moov, "trak");
  const tkhd = trak && find(...trak, "tkhd");
  if (!tkhd || tkhd[1] - tkhd[0] < 84) return undefined;
  // Width and height are the last two 16.16 fixed-point fields, after the version-dependent timestamps.
  const end = tkhd[0] + (data[tkhd[0]] === 1 ? 96 : 84);
  if (end > tkhd[1]) return undefined;
  return { width: data.readUInt32BE(end - 8) >>> 16, height: data.readUInt32BE(end - 4) >>> 16 };
}

/**
 * Add link-preview tags, a web app manifest and a preview image to `dist/`. Tags the page already has are
 * left alone, so a hand-written `<meta property="og:title">` always wins. Returns warnings to print.
 */
export function writeLaunchFiles(root: string, dist: string, config: LaunchConfig = {}): string[] {
  if (config.enabled === false) return [];
  const warnings: string[] = [];
  const indexFile = join(dist, "index.html");
  if (!existsSync(indexFile)) return ["no dist/index.html, so no link-preview tags were added"];
  let html = readFileSync(indexFile, "utf8");
  // The page's own <title> beats the package name, which is often scoped or a template id.
  const pageTitle = /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim();
  const { title, description } = launchInfo(root, { ...(pageTitle ? { title: pageTitle } : {}), ...config });

  let image: string | undefined;
  const source = config.image ? join(root, config.image) : baselineImages(root)[0];
  if (source && existsSync(source)) {
    image = `preview${extname(source).toLowerCase() || ".png"}`;
    copyFileSync(source, join(dist, image));
  } else if (config.image) warnings.push(`launch.image ${config.image} not found`);

  let video: { file: string; size: { width: number; height: number } | undefined } | undefined;
  if (config.video) {
    const path = join(root, config.video);
    if (existsSync(path)) {
      video = { file: "preview.mp4", size: mp4Size(readFileSync(path)) };
      copyFileSync(path, join(dist, video.file));
    } else warnings.push(`launch.video ${config.video} not found`);
  }

  let icon: string | undefined;
  if (config.icon) {
    const path = join(root, config.icon);
    if (existsSync(path)) {
      icon = `icon${extname(path).toLowerCase()}`;
      copyFileSync(path, join(dist, icon));
    } else warnings.push(`launch.icon ${config.icon} not found`);
  }

  const background = config.background ?? "#000000";
  const manifest = {
    name: title,
    short_name: title.length > 12 ? title.slice(0, 12) : title,
    ...(description ? { description } : {}),
    start_url: ".",
    display: config.display ?? "fullscreen",
    ...(config.orientation ? { orientation: config.orientation } : {}),
    background_color: background,
    theme_color: config.themeColor ?? background,
    icons: icon ? [{ src: icon, sizes: "any", type: icon.endsWith(".png") ? "image/png" : "image/jpeg", purpose: "any" }] : [],
  };
  writeFileSync(join(dist, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);

  const absolute = (file: string) =>
    config.url ? new URL(file, config.url.endsWith("/") ? config.url : `${config.url}/`).toString() : file;
  const imageUrl = image && absolute(image);
  const videoUrl = video && absolute(video.file);
  if ((image || video) && !config.url)
    warnings.push(
      "set `launch: { url }` in debuff.config.ts to the game's public address, so link previews can show the image (crawlers need an absolute URL)",
    );
  const tags: [string, string][] = [
    ['name="description"', description ?? ""],
    ['property="og:type"', "website"],
    ['property="og:title"', title],
    ['property="og:description"', description ?? ""],
    ['property="og:url"', config.url ?? ""],
    ['property="og:image"', imageUrl ?? ""],
    ['property="og:video"', videoUrl ?? ""],
    ['property="og:video:secure_url"', videoUrl?.startsWith("https:") ? videoUrl : ""],
    ['property="og:video:type"', video ? "video/mp4" : ""],
    ['property="og:video:width"', video?.size ? String(video.size.width) : ""],
    ['property="og:video:height"', video?.size ? String(video.size.height) : ""],
    ['name="twitter:card"', image ? "summary_large_image" : "summary"],
    ['name="theme-color"', manifest.theme_color],
  ];
  const add: string[] = [];
  for (const [key, value] of tags) if (value && !html.includes(key)) add.push(`<meta ${key} content="${escapeAttr(value)}" />`);
  if (!html.includes('rel="manifest"')) add.push('<link rel="manifest" href="manifest.webmanifest" />');
  if (icon && !html.includes('rel="icon"')) add.push(`<link rel="icon" href="${icon}" />`);
  if (add.length) {
    html = html.includes("</head>") ? html.replace("</head>", `  ${add.join("\n    ")}\n  </head>`) : `${add.join("\n")}\n${html}`;
    writeFileSync(indexFile, html);
  }
  return warnings;
}
