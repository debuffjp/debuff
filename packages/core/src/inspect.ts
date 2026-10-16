import type { Unsubscribe } from "./hooks.js";

/**
 * Named providers of JSON-serialisable snapshots, on `game.inspect`. Dev tools and scenarios
 * read them (`__DEBUFF_DEV__.state().plugins`). Providers only run when something asks, never per frame.
 */
export class InspectRegistry {
  private readonly providers = new Map<string, () => unknown>();

  register(name: string, provider: () => unknown): Unsubscribe {
    if (this.providers.has(name)) throw new Error(`Inspect provider "${name}" is already registered`);
    this.providers.set(name, provider);
    return () => {
      this.providers.delete(name);
    };
  }

  /** Call every provider. A failing provider reports `{ error }` instead of breaking the snapshot. */
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, provider] of this.providers) {
      try {
        out[name] = provider();
      } catch (err) {
        out[name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return out;
  }
}
