# ADR 0003: Scenarios are JSON, time is stepped

- Status: accepted
- Date: 2026-10-16

## Decision

Gameplay scenarios are JSON files under `scenarios/`. With `?debuff-scenario`, the game loop is stopped and time only advances through `wait` steps (`game.step(n)`). Assertions read `__DEBUFF_DEV__.state()`, which includes `Scene.inspect()`. Captures are diffed against committed baselines with a pixel tolerance.

## Why

- JSON is equally easy for humans, agents and tools to write and diff.
- Stepped time plus a seeded RNG makes runs reproducible across machines, apart from minor rasterisation differences, which the tolerance covers.
- Plain data keeps the door open for recording scenarios from live play later.
