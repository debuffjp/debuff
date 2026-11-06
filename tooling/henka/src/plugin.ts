/**
 * The Vite plugin that applies a source mutant as the file is loaded, so nothing on disk changes and any
 * tool that loads code through Vite (Vitest, keiko, a dev server) runs the mutated code.
 *
 * @module
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { applyMutant, type SourceMutant } from "./source.js";

/** The mutant to apply, which can change between runs, and whether it could be. */
export interface PluginState {
  mutant?: SourceMutant;
  /** Set when the mutant's file reached the plugin already changed by another plugin, so it wasn't applied. */
  refused?: string;
}

const norm = (p: string) => p.split("?")[0]?.split("\\").join("/").toLowerCase() ?? "";

/** Swap in `state.mutant`'s code for its file. Invalidate the file in Vite after changing the mutant. */
export function henka(options: { root: string; state: PluginState }): Plugin {
  const { root, state } = options;
  return {
    name: "henka",
    enforce: "pre",
    transform(code, id) {
      const mutant = state.mutant;
      if (!mutant || norm(id) !== norm(resolve(root, mutant.file))) return;
      if (code !== readFileSync(resolve(root, mutant.file), "utf8")) {
        state.refused = `another plugin changed ${mutant.file} before henka could`;
        return;
      }
      return { code: applyMutant(code, mutant), map: null };
    },
  };
}
