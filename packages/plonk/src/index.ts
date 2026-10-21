// plonk: game music made in code. Songs are small pieces of data (instruments and patterns of notes), synthesized live
// with Web Audio: no audio files to download, tiny, and easy to tweak or make react to the game.
//
//   import { Player, type Song } from "plonk";
//   const player = new Player();
//   player.play(theme);

export { Player, type PlayerOptions, type PlayOptions } from "./player.js";
export {
  frequency,
  type Instrument,
  type NoteEvent,
  notes,
  parse,
  type Song,
  type Step,
  sectionSteps,
  songSteps,
  stepSeconds,
} from "./song.js";
