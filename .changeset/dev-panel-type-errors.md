---
"@debuffjp/dev": patch
"create-debuff": patch
---

The dev panel's type errors are easier to read. Repeats collapse into one card, errors only in test files are labelled and muted (the header says "2 type errors in tests"), TS5097 suggests its fix and each card has **copy for agent**. The rewind slider is labelled. Templates set `allowImportingTsExtensions`, so tests can import `.ts` paths without TS5097.
