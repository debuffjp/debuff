// No hooks at all: tests read the game through its page.
let frames = 0;
window.started = Date.now();
function frame() {
  frames++;
  window.frameCount = frames;
  if (frames === 3) throw new Error("frame 3 is cursed");
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
