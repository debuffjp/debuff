// The renderer lives in spryte; re-exported so games keep importing it from core.
export {
  BitmapFont,
  type BitmapFontOptions,
  type BlendMode,
  type ClipRect,
  type Color,
  Draw,
  type Frame,
  type Glyph,
  type Matrix,
  type RawContext,
  type SpriteDrawOptions,
  type TextDrawOptions,
  type TextureSource,
  toRGBA,
} from "spryte";
export { Camera, type CameraOptions } from "./camera.js";
export { FixedClock, type FixedClockOptions } from "./clock.js";
export { Game, type GameOptions, type ScaleMode } from "./game.js";
export { type GameErrorContext, type HookArgs, type HookName, Hooks, type Unsubscribe } from "./hooks.js";
export { InspectRegistry } from "./inspect.js";
export * from "./math.js";
export {
  type BooleanParamSpec,
  type NumberParamSpec,
  type ParamChange,
  type ParamDescription,
  ParamGroup,
  ParamRegistry,
  type ParamSchema,
  type ParamSpec,
  type ParamValue,
  type ParamValues,
} from "./params.js";
export type { Plugin } from "./plugin.js";
export { Random } from "./random.js";
export { debuffSans } from "./render/debuff-sans.js";
export type { Scene } from "./scene.js";
export type { SplashOptions } from "./splash.js";
export { type AnimationClip, type Origin, originOffset, Sprite, type SpriteOptions, sliceGrid } from "./sprite.js";
export { FrameStats } from "./stats.js";
export { Storage } from "./storage.js";
