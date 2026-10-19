import { Application, Graphics } from "pixi.js";
import { click, HEIGHT, keys, SPEED, state, WIDTH } from "../../../shared/game.js";

const app = new Application();
await app.init({ width: WIDTH, height: HEIGHT, background: "#111111" });
document.body.appendChild(app.canvas);
const player = new Graphics().rect(0, 0, 4, 4).fill(0xcffb2d);
player.y = 90;
app.stage.addChild(player);
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.on("pointerdown", (e) => click(e.global.x, e.global.y));
app.ticker.add((ticker) => {
  if (keys.has("ArrowRight")) state.x += (SPEED * ticker.deltaMS) / 1000;
  player.x = state.x;
});
state.ready = true;
