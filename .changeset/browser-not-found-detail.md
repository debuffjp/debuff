---
"@debuffjp/cli": patch
---

When `debuff scenario`, `debuff fuzz`, `debuff doctor` or the MCP server can't start a browser, the error now says what was tried: Chrome and Edge with the path Playwright looked in, and Playwright's own Chromium with the browser's error when it is installed but won't start (such as a missing shared library). It says whether `DEBUFF_BROWSER` is set. When `DEBUFF_BROWSER` points at a browser that won't start, the message names the variable and its path, and the fix says to correct or unset it instead of telling you to set it.
