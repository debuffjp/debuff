// One rotated sprite, the smallest idiomatic Phaser 4 app (WebGL renderer, Scene with preload and create).
import Phaser from "phaser";

new Phaser.Game({
  type: Phaser.WEBGL,
  canvas: document.querySelector("canvas"),
  width: 320,
  height: 180,
  scene: {
    preload() {
      this.load.image("sprite", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    },
    create() {
      this.add.image(10, 10, "sprite").setRotation(1);
    },
  },
});
