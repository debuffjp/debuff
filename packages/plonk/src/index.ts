// plonk: game music made in code. Songs are small pieces of data (instruments and patterns of notes), synthesized live
// with Web Audio: no audio files to download, tiny, and easy to tweak or make react to the game.
//
//   import { Player, type Song } from "plonk";
//   const player = new Player();
//   player.play(theme);

export { type Analysis, analyse, loudness, type MixReport, mix, RENDER_RATE, render } from "./analyse.js";
export { Player, type PlayerOptions, type PlayOptions, type SfxOptions } from "./player.js";
export {
  chord,
  degree,
  frequency,
  type Instrument,
  type NoteEvent,
  notes,
  parse,
  parseKey,
  SCALES,
  type Song,
  type Step,
  sectionSteps,
  songSteps,
  stepSeconds,
  type Track,
} from "./song.js";
