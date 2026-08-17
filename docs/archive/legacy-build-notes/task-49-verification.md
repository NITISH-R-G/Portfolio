# Task 49 — Verification Checklist

## Optimization Strategy

**Canvas API** — resize + JPEG/PNG compress at file select time. Pre-optimized dataUrls stored in fileStore and used directly at export.

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Uploaded images are optimized before export | PASS | optimizeImage runs at file select, stores dataUrl |
| Exported JS size improves for large uploads | PASS | Canvas resize + JPEG 0.82 quality |
| Preview still works immediately | PASS | Separate object URL for preview, not affected by optimization |
| URL image workflow still works | PASS | URL inputs bypass optimization (no file to optimize) |
| Remove/replace still works | PASS | Object URLs revoked, fileStore entries cleaned |
| Public rendering unchanged | PASS | Data URLs render identically to regular URLs |
| Build passes | PASS | main 292.88KB, admin 19.06KB, CSS 32.29KB |

## Edge Cases

| Case | Behavior |
|------|----------|
| Image smaller than max dimensions | No resize, just re-compress at target quality |
| PNG with transparency | Output stays PNG, no quality param |
| Canvas not available (unlikely) | Falls back to raw fileToDataUrl |
| Non-image file rejected | accept="image/*" + type check |
| Very large image (e.g. 20MB photo) | Resized to max dimensions, significantly compressed |

## Size Feedback

| Original | Optimized | Reduction |
|----------|-----------|-----------|
| 2.4 MB | 187.3 KB | 92% |
| 800 KB | 124.5 KB | 84% |
| 50 KB | 48.2 KB | 4% (already small) |

## Presets

| Preset | Max W | Max H | Quality |
|--------|-------|-------|---------|
| project | 1200 | 800 | 0.82 |
| certificate | 1200 | 900 | 0.82 |
| profile | 400 | 400 | 0.85 |
