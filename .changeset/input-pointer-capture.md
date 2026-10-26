---
"@debuffjp/input": patch
---

A press is no longer dropped when `setPointerCapture` throws. Synthetic pointer events and unknown pointer ids make it throw `NotFoundError`, which stopped the press from registering. The pointer now tries to capture and carries on if it can't.
