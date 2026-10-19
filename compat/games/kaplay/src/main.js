import kaplay from "kaplay";
import { click, HEIGHT, SPEED, state, WIDTH } from "../../../shared/game.js";

const k = kaplay({ width: WIDTH, height: HEIGHT, global: false, background: [17, 17, 17] });
k.scene("level", () => {
  const player = k.add([k.rect(4, 4), k.pos(0, 90), k.color(207, 251, 45)]);
  k.onUpdate(() => {
    if (k.isKeyDown("right")) state.x += SPEED * k.dt();
    player.pos.x = state.x;
  });
  k.onMousePress(() => {
    const m = k.mousePos();
    click(m.x, m.y);
  });
  state.ready = true;
});
k.go("level");
