// Two mechanics in separate functions, so a change to one leaves the other's test alone.
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));

let x = 0;
let shots = 0;
let level;

function walk() {
  x += 2;
}

function shoot() {
  shots += 1;
}

fetch("/level.json")
  .then((r) => r.json())
  .then((data) => {
    level = data.name;
  });

function frame() {
  if (keys.has("ArrowRight")) walk();
  if (keys.has("KeyZ")) shoot();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__KEIKO__ = { state: () => (level ? { x, shots, level } : undefined), scene: () => "play" };
