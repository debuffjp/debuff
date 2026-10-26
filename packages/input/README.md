# @debuffjp/input

Action-based input across keyboard, mouse/touch/pen (Pointer Events) and gamepads (standard mapping). No dependencies.

```ts
import { Input } from "@debuffjp/input";

const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    jump: ["Space", "PadA", "Pointer"],
  },
});

// inside Scene.update
const dx = input.axis("left", "right");
if (input.pressed("jump")) jump();
```

Edges clear automatically after each simulation step, so a tap shorter than a frame is never missed.

## Binding names

| Source | Names |
| --- | --- |
| Keyboard | [`KeyboardEvent.code`](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/code): `Space`, `KeyZ`, `ArrowUp`, … |
| Pointer | `Pointer` (primary mouse button, touch or pen), `PointerRight`, `PointerMiddle` (right and middle mouse buttons) |
| Gamepad | `PadA` `PadB` `PadX` `PadY` `PadL1` `PadR1` `PadL2` `PadR2` `PadSelect` `PadStart` `PadL3` `PadR3` `PadUp` `PadDown` `PadLeft` `PadRight` |
| Left stick | `PadStickUp` `PadStickDown` `PadStickLeft` `PadStickRight` |

## API

- `input.down(action)`, `input.pressed(action)`, `input.released(action)`, `input.axis(neg, pos)`
- `input.pointer`: `x`, `y` (logical), `down`, `pressed`, `released`, `touches`
- `input.pointer.kind`: `"mouse"`, `"touch"` or `"pen"`, whichever made the latest press
- `input.pointer.touchesStarted`, `touchesEnded`: contacts that started or ended this step (each with `id`, `x`, `y`, `kind`), so a game doesn't diff `touches` itself
- `input.pointer.right`, `input.pointer.middle`: `down`, `pressed`, `released` for the right and middle mouse buttons
- `input.pointer.wheel`, `wheelX`: wheel or trackpad scroll this step in CSS pixels (positive = down / right), reset every step. Pass `captureWheel: true` to stop the page scrolling under a game that zooms with the wheel.
- `input.keys`: `down(code)`, `pressed(code)`, `released(code)`
- `input.pads`: `stickX`, `stickY`, `connected`, `deadzone`
- Programmatic control for tests and on-screen buttons: `keys.press/release`, `pointer.press/move/release/scroll/pressButton/releaseButton`, and `pointer.touchStart(id, x, y)` / `touchMove` / `touchEnd` for multi-touch (the first contact also presses the primary pointer, as a real touch does)
