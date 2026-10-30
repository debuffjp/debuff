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
| On-screen controls (`TouchControls`, from 0.25) | `TouchStickUp` `TouchStickDown` `TouchStickLeft` `TouchStickRight`, and `Touch<name>` for each button: `TouchA`, `TouchJump`, … |

## On-screen touch controls

From 0.25, `TouchControls` puts a stick and buttons on the screen for phones and tablets. They feed the same actions as keys and pads, so the game reads `input.down("jump")` whatever the player uses:

```ts
import { Input, TouchControls } from "@debuffjp/input";

const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "PadStickLeft", "TouchStickLeft"],
    right: ["ArrowRight", "PadStickRight", "TouchStickRight"],
    jump: ["Space", "PadA", "TouchA"],
  },
});
const touch = new TouchControls(game, input, {
  stick: { x: 40, y: -40, zone: [0, 0, 160, -1] }, // floating: centres where the thumb lands on the left
  buttons: { A: { x: -32, y: -32 } },              // 32 units in from the bottom-right corner
});

// in render, outside draw.withCamera:
touch.draw(draw);
```

- Positions are in logical units; a negative one counts from the right or bottom edge, so the layout holds when `scale: "expand"` changes the size. `radius` defaults to 24 for the stick and 16 for a button.
- A stick with a `zone` floats: it centres wherever the thumb lands in that rectangle. Without one it stays put and takes touches within twice its radius. `touch.stick.x` and `y` are analog (-1 to 1); the four `TouchStick` directions count past `deadzone` (default 0.3).
- Each contact belongs to the control it started on until the finger lifts, so a thumb can slide off a button and keep it held, and a quick tap between two steps still counts as pressed and released.
- They show from the first touch (`show: "touch"`), so mouse and keyboard players never see them; `show: "always"` or `"never"`, or set `touch.visible` yourself.
- Their contacts are the pointer's too. Code that moves toward `input.pointer` should skip it while `touch.holding`, or check `touch.owns(id)` per contact.
- `draw()` is plain translucent circles (`{ color, alpha }` to tint them). How the controls look is the game's call: read `touch.stick` (centre, knob, `held`) and `touch.buttons` (position, `down`) to draw your own.
- Tests and agents drive them with `input.pointer.touchStart(id, x, y)`, `touchMove` and `touchEnd`, and replays record them like any touch.

## API

- `input.down(action)`, `input.pressed(action)`, `input.released(action)`, `input.axis(neg, pos)`
- `input.rebind(action, keys)`: replace an action's bindings (a controls menu), keeping captured keys in step. `input.bindings` is Input's own copy of the map you passed, so change it with `rebind` rather than in place.
- `input.pointer`: `x`, `y` (logical), `down`, `pressed`, `released`, `touches`
- `input.pointer.kind`: `"mouse"`, `"touch"` or `"pen"`, whichever made the latest press
- `input.pointer.touchesStarted`, `touchesEnded`: contacts that started or ended this step (each with `id`, `x`, `y`, `kind`), so a game doesn't diff `touches` itself
- `input.pointer.right`, `input.pointer.middle`: `down`, `pressed`, `released` for the right and middle mouse buttons
- `input.pointer.wheel`, `wheelX`: wheel or trackpad scroll this step in CSS pixels (positive = down / right), reset every step. Pass `captureWheel: true` to stop the page scrolling under a game that zooms with the wheel.
- `input.keys`: `down(code)`, `pressed(code)`, `released(code)`
- `input.pads`: `stickX`, `stickY`, `connected`, `deadzone`
- `input.virtual`: sources set by code each step, by binding name (`TouchControls` writes its controls here). From 0.25
- Programmatic control for tests and on-screen buttons: `keys.press/release`, `pointer.press/move/release/scroll/pressButton/releaseButton`, and `pointer.touchStart(id, x, y)` / `touchMove` / `touchEnd` for multi-touch (the first contact also presses the primary pointer, as a real touch does)
