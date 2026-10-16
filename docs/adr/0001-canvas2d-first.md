# ADR 0001: Canvas 2D first, renderer swappable later

- Status: amended by ADR 0007 (WebGL2 is the performance path)
- Date: 2026-10-16

## Context

The planning brief left Canvas 2D vs PixiJS open until a benchmark exists. We want maximum leverage from web standards, a small runtime, and no premature multi-renderer abstraction.

## Decision

Render with the standard Canvas 2D API. `Scene.render` receives a `CanvasRenderingContext2D`, so games can use any part of the platform API directly. We don't wrap drawing in a renderer interface yet.

## Consequences

- Zero renderer dependency, and a few kB of runtime.
- Fine for typical jam-scale scenes. Very high sprite counts and shader effects will need WebGL2.
- When the benchmark (roadmap) shows a need, add an optional WebGL2 package. If two backends really diverge, introduce the abstraction then, with evidence.
