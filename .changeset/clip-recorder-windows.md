---
"@debuffjp/share": patch
---

`ClipRecorder` keeps its two recording windows half a window apart after a `clip()`. Before, the window a clip restarted also restarted at its old time, so the windows drifted together and later clips could be far shorter than half of `seconds`. Two `clip()` calls close together (a double tap on a share button) now both get the clip; before, the first never resolved.
