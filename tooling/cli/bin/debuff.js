#!/usr/bin/env node
// Committed shim so npm can link the bin before dist/ is built.
import "../dist/cli.js";
