import * as ex from "excalibur";
import { click, HEIGHT, SPEED, state, WIDTH } from "../../../shared/game.js";

const game = new ex.Engine({ width: WIDTH, height: HEIGHT, displayMode: ex.DisplayMode.Fixed, suppressPlayButton: true });
const player = new ex.Actor({ x: 0, y: 90, width: 4, height: 4, color: ex.Color.fromHex("#cffb2d") });
game.add(player);
game.on("preupdate", (e) => {
  if (game.input.keyboard.isHeld(ex.Keys.ArrowRight)) state.x += (SPEED * e.elapsed) / 1000;
  player.pos.x = state.x;
});
game.input.pointers.primary.on("down", (e) => click(e.worldPos.x, e.worldPos.y));
await game.start();
state.ready = true;
