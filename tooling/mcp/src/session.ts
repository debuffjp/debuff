import { callHook, createDevServer, hooksReady, launchBrowser } from "@debuff/cli";
import type { Browser, Page } from "playwright-core";
import type { ViteDevServer } from "vite";

/**
 * A live game: the project's dev server plus a headless browser page in controlled mode
 * (`?debuff-scenario`), so time only advances when an agent steps it.
 */
export class GameSession {
  private constructor(
    readonly root: string,
    readonly url: string,
    private readonly server: ViteDevServer,
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async start(root: string, options: { page?: string; width?: number; height?: number } = {}): Promise<GameSession> {
    const server = await createDevServer(root, { port: 0, logLevel: "error" });
    await server.listen();
    const base = server.resolvedUrls?.local[0];
    if (!base) {
      await server.close();
      throw new Error("Dev server did not report a URL");
    }
    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage({
        viewport: { width: options.width ?? 960, height: options.height ?? 540 },
        deviceScaleFactor: 1,
      });
      const url = new URL(options.page ?? "/", base);
      url.searchParams.set("debuff-scenario", "1");
      await page.goto(url.toString());
      await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });
      return new GameSession(root, url.toString(), server, browser, page);
    } catch (err) {
      await browser?.close();
      await server.close();
      throw err;
    }
  }

  /** Call a `window.__DEBUFF_DEV__` method. */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    return this.page.evaluate(callHook, [method, args] as [string, unknown[]]) as Promise<R>;
  }

  async stop(): Promise<void> {
    await this.browser.close();
    await this.server.close();
  }
}
