# Music timing under load

When does each note of a game's music actually start, while the main thread hitches and freezes? This plays steady
sixteenth notes at 120 bpm two ways in headless Chrome, with [plonk](../../packages/plonk) (notes scheduled ahead on
the audio clock) and with a minimal frame-loop sequencer (notes started from `requestAnimationFrame`), and records
every note's real start on the audio clock.

```bash
node bench/music-timing/run.mjs    # 5 rounds, about 6 minutes; writes results/<date>-<platform>.json
node bench/music-timing/chart.mjs  # results/timing.svg from the latest results
```

Conditions: idle; jank (the main thread blocks 60 ms every 500 ms); stall (300 ms every 2 s). For each engine and
condition the results hold every note's error in milliseconds, the median, p95, p99 and worst, the share more than
10 ms and 30 ms off, and the steps plonk skipped (it drops a note more than 10 ms overdue rather than playing it
late). The write-up is [Game music that stays on the beat when your frames don't](https://debuff.jp/research/music-timing-under-load).
