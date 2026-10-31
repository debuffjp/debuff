# @debuffjp/share

Make your game easy to pass around: clips of the last few seconds, the system share sheet, and "beat my run" challenge links. No dependencies, and each export can be used on its own.

```ts
import { ClipRecorder, challengeLink, clipFile, readChallenge, share } from "@debuffjp/share";

// A friend opened a challenge link: play their seed
const challenge = readChallenge<{ seed: number; score: number }>();
if (challenge) game.random.reseed(challenge.seed);

// Keep the last ~12 seconds while a run is going
const clips = new ClipRecorder(game.canvas, { seconds: 12 });
clips.start();

// On a "share" button (share needs a click or key press)
const clip = await clips.clip();
await share({
  text: `I scored ${score}. Beat it?`,
  url: challengeLink({ seed, score }),
  files: clip ? [clipFile(clip, "my-run")] : [],
});
```

- `share()` opens the share sheet where there is one and copies the text and link otherwise. It returns `"shared"`, `"copied"`, `"cancelled"` or `"unsupported"` so you can show the right toast.
- `ClipRecorder` runs two staggered `MediaRecorder`s, so start it when a run begins rather than on page load. `ClipRecorder.supported()` tells you whether to show a clip button at all.
- Challenge data is visible in the URL. Put game state in it, never anything personal.
- `screenshot(canvas)` and `download(blob, name)` cover "save image" buttons.
- `postIntent({ text, url }, "x" | "bluesky")` returns a link that opens the X or Bluesky composer with a post drafted, cut to fit (280 weighted characters on X with links at 23, 300 graphemes on Bluesky). Nothing is posted. Use it where you want it, for example in a dev script for devlog posts; debuff never adds it to a game. Added in 0.25.
