import * as THREE from "three";
import { click, HEIGHT, keys, SPEED, state, WIDTH } from "../../../shared/game.js";

const renderer = new THREE.WebGLRenderer();
renderer.setSize(WIDTH, HEIGHT);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
// One world unit per pixel, origin top-left, y down, like the other games.
const camera = new THREE.OrthographicCamera(0, WIDTH, 0, -HEIGHT, -1, 1);
const player = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xcffb2d }));
player.position.y = -90;
scene.add(player);
renderer.domElement.addEventListener("pointerdown", (e) => {
  const box = renderer.domElement.getBoundingClientRect();
  click(e.clientX - box.left, e.clientY - box.top);
});
let last;
renderer.setAnimationLoop((now) => {
  const dt = last === undefined ? 0 : (now - last) / 1000;
  last = now;
  if (keys.has("ArrowRight")) state.x += SPEED * dt;
  player.position.x = state.x;
  renderer.render(scene, camera);
});
state.ready = true;
