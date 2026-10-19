import type { Tween, Tweens } from "./tween.js";

export interface Squashable {
  scaleX: number;
  scaleY: number;
}

/** Squash-and-stretch: snap to a deformed scale then spring back to 1.
 *  `amount` > 0 squashes (wide/short, e.g. landing), < 0 stretches (tall/thin, e.g. jump).
 *  Only scale tweens on the target are replaced; a move or fade already running keeps going. */
export function squash(tweens: Tweens, target: Squashable, amount = 0.3, duration = 0.25): Tween {
  tweens.kill(target, ["scaleX", "scaleY"]);
  target.scaleX = 1 + amount;
  target.scaleY = 1 - amount;
  return tweens.to(target, { scaleX: 1, scaleY: 1 }, { duration, ease: "outElastic" });
}
