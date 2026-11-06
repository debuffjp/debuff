// A plain canvas game for `keiko mutate`: params, frame-timestamp movement and Math.random().
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key));
addEventListener("keyup", (e) => keys.delete(e.key));

const params = { player: { speed: 120, canJump: true } };
const coin = Math.random();
let x = 0;
let last;

function frame(now) {
  const dt = last === undefined ? 0 : (now - last) / 1000;
  last = now;
  if (keys.has("ArrowRight")) x += params.player.speed * dt;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__KEIKO__ = {
  state: () => ({ x, coin }),
  params: () => structuredClone(params),
  setParam: (group, key, value) => {
    params[group][key] = value;
  },
};
