// What every compat game shares: one player that walks right at 120 px/s while ArrowRight is held,
// a click counter that records where the last click landed in game coordinates, and the keiko hook.
export const SPEED = 120;
export const WIDTH = 320;
export const HEIGHT = 180;

export const state = { ready: false, x: 0, clicks: 0, px: -1, py: -1, roll: Math.random() };

export function click(x, y) {
  state.clicks++;
  state.px = Math.round(x);
  state.py = Math.round(y);
}

/** Keys held, by KeyboardEvent.code, for engines without their own keyboard API. */
export const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));

window.__KEIKO__ = {
  state: () => ({ ...state, x: Math.round(state.x * 1000) / 1000 }),
  scene: () => (state.ready ? "level" : "boot"),
};
