# Security policy

## Supported versions

debuff is pre-1.0. Only the latest published minor version receives fixes.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's **"Report a vulnerability"** button on the repository's Security tab.

Include affected packages and versions, a description, and reproduction steps if you can. We'll acknowledge within 3 working days and keep you updated until it's resolved. We'll credit you in the release notes unless you'd rather we didn't.

## Scope notes

- `@debuff/dev` and the CLI's scenario runner are development tools. They expose control hooks by design and must not ship to production. `debuff build` fails if they do.
- Games load only the assets their own manifest lists. Treat third-party asset packs like any other dependency.
