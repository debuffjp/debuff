// A plain canvas game with no engine: its own requestAnimationFrame loop, DOM keyboard and pointer
// input, and variable time steps from the frame timestamp. keiko tests it without any adapter beyond
// the optional window.__KEIKO__ snapshot.
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key));
addEventListener("keyup", (e) => keys.delete(e.key));

const params = { player: { speed: 120 } };
let x = 0;
let jumps = 0;
let clicks = 0;
let last;
const sparkle = Math.random(); // unseeded randomness, on purpose
canvas.addEventListener("pointerdown", () => clicks++);

function frame(now) {
  const dt = last === undefined ? 0 : (now - last) / 1000;
  last = now;
  if (keys.has("ArrowRight")) x += params.player.speed * dt;
  if (keys.has(" ")) jumps++;
  ctx.fillStyle = "#cffb2d";
  ctx.fillRect(x, 90, 4, 4);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__KEIKO__ = {
  state: () => ({ x: Math.round(x), jumps, clicks, sparkle }),
  scene: () => "level",
  params: () => structuredClone(params),
  setParam: (group, key, value) => {
    params[group][key] = value;
  },
};
