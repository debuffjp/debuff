import { click, HEIGHT, keys, SPEED, state, WIDTH } from "../../../shared/game.js";

const canvas = document.createElement("canvas");
canvas.width = WIDTH;
canvas.height = HEIGHT;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");
canvas.addEventListener("pointerdown", (e) => {
  const box = canvas.getBoundingClientRect();
  click(e.clientX - box.left, e.clientY - box.top);
});
let last;
function frame(now) {
  const dt = last === undefined ? 0 : (now - last) / 1000;
  last = now;
  if (keys.has("ArrowRight")) state.x += SPEED * dt;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#cffb2d";
  ctx.fillRect(state.x, 90, 4, 4);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
state.ready = true;
