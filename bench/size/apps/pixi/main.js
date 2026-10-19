// One rotated sprite, the smallest idiomatic PixiJS 8 app.
import { Application, Assets, Sprite } from "pixi.js";

const app = new Application();
await app.init({ canvas: document.querySelector("canvas"), width: 320, height: 180, preference: "webgl" });
const sprite = new Sprite(await Assets.load("data:image/gif;base64,R0lGODlhAQABAAAAACw="));
sprite.rotation = 1;
app.stage.addChild(sprite);
