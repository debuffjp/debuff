# Governance

## Roles

- **Users** build games with Debuff and tell us what works and what doesn't.
- **Contributors** send issues, docs, templates, plugins and code.
- **Maintainers** review and merge, cut releases, and own the roadmap. Contributors with a sustained record of good work are invited to become maintainers.

## How decisions are made

| Change | Process |
| --- | --- |
| Bug fixes, docs, tests, internal refactors | Pull request with one maintainer approval |
| New public API, new package, new dependency | Issue or draft PR describing the API first; two maintainer approvals |
| Architecture, scope or policy changes | An RFC: add `docs/adr/NNNN-title.md` with status `proposed` in a PR. Discuss for at least a week, then maintainers accept or decline |

Maintainers seek consensus. If they can't reach it, the lead maintainer decides and records the reasoning in the ADR.

## Principles that guide decisions

These are listed in [CONTRIBUTING.md](./CONTRIBUTING.md#principles-for-changes): web standards first, pay only for what you use, measure before claiming, dev never ships, explicit over clever, humans own creative decisions.
