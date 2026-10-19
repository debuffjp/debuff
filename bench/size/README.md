# Download size

How much JavaScript a minimal app ships with spryte vs PixiJS 8. Each app in `apps/` draws one rotated sprite. The script builds each with Vite (production) and measures the JS with brotli quality 11:

- **startup:** scripts the page loads directly;
- **all JS:** startup plus lazy chunks.

```bash
npm run build            # spryte's dist
node bench/size/run.mjs  # writes results/<date>.json with the versions used
```

The PixiJS app uses `Application` + `Assets` + `Sprite`, the idiomatic setup from PixiJS's docs. A hand-minimised PixiJS app (a bare `WebGLRenderer`) is smaller in total (about 90 kB), but not at startup, which is why startup is the figure we quote.
