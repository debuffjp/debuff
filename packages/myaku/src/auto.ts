/**
 * One line to profile any game: `import "myaku/auto"` first in your entry file (or a `<script type="module">`
 * before the game's). Starts the profiler and shows the overlay (toggle with Alt+M).
 */
import { myaku } from "./index.js";
import { overlay } from "./overlay.js";

const profiler = myaku();
const start = () => overlay(profiler);
if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });
