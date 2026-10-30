---
"spryte": minor
---

`drawElement` (experimental): draw a live DOM element (a menu, a text field, rich text) inside the canvas, through spryte's transforms and shaders, with Chrome's HTML-in-Canvas API (Chrome and Edge 157 and later). The element keeps clicks, focus, typing, text selection and screen readers where it's drawn. It returns false, drawing nothing, where the API is missing, so the element stays in the page. `canDrawElements()` reports support. Guide: https://debuff.jp/spryte/html-in-canvas
