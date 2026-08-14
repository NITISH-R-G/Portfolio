# Task 49 — Image Optimization Before Export

## Optimization Strategy

**Canvas API** — client-side resize + compress using browser-native `<canvas>`.

### How it works

1. User selects image file
2. `optimizeImage(file, preset)` runs immediately:
   - Loads image into `Image` element via `URL.createObjectURL()`
   - Calculates target dimensions (preserves aspect ratio, never upscales)
   - Draws to `<canvas>` at target size
   - Exports as JPEG (or PNG if source is PNG) via `canvas.toDataURL()`
   - Returns `{ dataUrl, originalSize, optimizedSize, width, height }`
3. Optimized `dataUrl` stored in `fileStore` (not raw file)
4. Preview shows original file (via separate object URL)
5. Export uses pre-optimized `dataUrl` directly

### Presets

| Preset | Max Width | Max Height | Quality | Use Case |
|--------|-----------|------------|---------|----------|
| `project` | 1200px | 800px | 0.82 | Project cover images |
| `certificate` | 1200px | 900px | 0.82 | Certificate images |
| `profile` | 400px | 400px | 0.85 | Profile photo (reserved) |

### Key behaviors

- **Aspect ratio preserved** — images are scaled proportionally
- **No upscaling** — small images stay at original size
- **PNG transparency** — if source is PNG, output stays PNG (no quality param)
- **Graceful fallback** — if Canvas fails, falls back to raw `fileToDataUrl()`
- **Size feedback** — shows "original → optimized (X% smaller)" in UI

### Size feedback format

```
2.4 MB → 187.3 KB (92% smaller)
```

- Original size in muted color
- Optimized size in green
- Reduction percentage in green

## Export Behavior

- `fileStore` now stores `{ dataUrl, originalName }` instead of raw `File`
- Export reads `entry.dataUrl` directly — no re-optimization at export time
- Draft (localStorage) stores metadata only — no image data

## Files Updated

- `src/admin/AdminEditor.jsx` — `optimizeImage()`, `formatBytes()`, `IMAGE_PRESETS`, updated ImageField/ProjectsEditor/CertificationsEditor/export
- `src/styles/global.css` — `.image-size-info` styles
- `docs/task-49-image-optimization.md` — this file
- `docs/task-49-verification.md` — verification checklist
- `build-log.md` — task entry
