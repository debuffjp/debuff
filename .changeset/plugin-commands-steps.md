---
"@debuff/cli": minor
---

Tooling plugins (ADR 0004, phase 3): `commands` become `debuff <plugin>:<command>`, and `scenarioSteps` add `{ "<plugin>:<step>": value }` steps with JSON Schemas merged into `.debuff/scenario.schema.json`. Also fixes `debuff --help` printing twice.
