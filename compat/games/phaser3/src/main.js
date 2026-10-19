import * as ns from "phaser3";
import { click, HEIGHT, SPEED, state, WIDTH } from "../../../shared/game.js";

const Phaser = ns.default ?? ns;

class Level extends Phaser.Scene {
  constructor() {
    super("level");
  }
  create() {
    this.player = this.add.rectangle(0, 90, 4, 4, 0xcffb2d);
    this.right = this.input.keyboard.addKey("RIGHT");
    this.input.on("pointerdown", (p) => click(p.x, p.y));
    state.ready = true;
  }
  update(_time, delta) {
    if (this.right.isDown) state.x += (SPEED * delta) / 1000;
    this.player.x = state.x;
  }
}

window.game = new Phaser.Game({ type: Phaser.AUTO, width: WIDTH, height: HEIGHT, scene: [Level], banner: false });
