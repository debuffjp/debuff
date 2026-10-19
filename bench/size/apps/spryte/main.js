// One rotated sprite, the smallest real spryte app.
import { createRenderer } from "spryte";

const canvas = document.querySelector("canvas");
const image = new Image();
image.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const draw = createRenderer(canvas);
requestAnimationFrame(function frame() {
  draw.begin("#000", 320, 180, 1);
  draw.sprite(image, 10, 10, { rotation: 1 });
  draw.end();
  requestAnimationFrame(frame);
});
