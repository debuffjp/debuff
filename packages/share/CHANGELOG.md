# @debuffjp/share

## 0.26.0

### Minor Changes

- 4df1648: `postIntent({ text, url }, "x" | "bluesky")` returns a link that opens the X or Bluesky composer with a post drafted. Text is cut to fit with "…": 280 weighted characters on X (CJK and emoji count 2, a link 23) and 300 graphemes on Bluesky. Nothing is posted, and it's only there if you call it. `xWeight(text)` gives X's weighted length.

## 0.25.0

No changes in this release.

## 0.24.3

No changes in this release.

## 0.24.2

No changes in this release.

## 0.24.1

No changes in this release.

## 0.24.0

No changes in this release.

## 0.23.0

No changes in this release.

## 0.22.1

No changes in this release.

## 0.22.0

No changes in this release.

## 0.21.1

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.0

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

No changes in this release.

## 0.17.0

No changes in this release.

## 0.16.0

No changes in this release.

## 0.15.0

No changes in this release.

## 0.14.0

No changes in this release.

## 0.13.3

No changes in this release.

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

## 0.9.3

No changes in this release.

## 0.9.2

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

### Minor Changes

- 61798e2: New package: `@debuffjp/share`, with rolling canvas clips (`ClipRecorder`), the share sheet with a clipboard fallback (`share`), "beat my run" links (`challengeLink`, `readChallenge`), `screenshot` and `download`.
