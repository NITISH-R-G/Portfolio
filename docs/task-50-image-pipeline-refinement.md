# Task 50 — Image Pipeline Refinement

## What Changed

### Part 1: Optimization Pipeline — `toBlob` internally

**Before:** `canvas.toDataURL()` → huge base64 string in memory → estimate optimized size from string length

**After:** `canvas.toBlob()` → binary blob (memory-efficient) → `blobToDataUrl()` only at the end → accurate `blob.size`

The key change in `optimizeImage()`:
```js
canvas.toBlob(async (blob) => {
  if (!blob) {
    // Fallback: toDataURL if toBlob fails
    const dataUrl = canvas.toDataURL(mimeType, quality)
    ...
  }
  const dataUrl = await blobToDataUrl(blob)
  resolve({ dataUrl, originalSize: file.size, optimizedSize: blob.size, ... })
}, mimeType, quality)
```

Added `blobToDataUrl()` helper that converts a Blob to data URL via FileReader.

**Benefits:**
- `toBlob` produces a binary Blob directly (no base64 encoding overhead during processing)
- Blob is smaller in memory than the equivalent base64 string
- `blob.size` gives accurate byte count (no string-length estimation)
- Fallback to `toDataURL` if `toBlob` returns null

### Part 2: Object URL Hygiene — Already Clean

Audited all object URL lifecycle:

| Location | Create | Revoke | Status |
|----------|--------|--------|--------|
| `optimizeImage` | `URL.createObjectURL(file)` for Image load | Immediately after `img.onload` | ✅ |
| `ProjectsEditor.handleFileSelect` | `URL.createObjectURL(file)` for preview | Old URL revoked before new one created | ✅ |
| `ProjectsEditor.handleRemoveImage` | — | Revoked on remove | ✅ |
| `ProjectsEditor.removeItem` | — | Revoked on card remove | ✅ |
| `CertificationsEditor.handleFileSelect` | `URL.createObjectURL(file)` for preview | Old URL revoked before new one created | ✅ |
| `CertizationsEditor.handleRemoveImage` | — | Revoked on remove | ✅ |
| `CertificationsEditor.removeItem` | — | Revoked on card remove | ✅ |
| `ImageField` URL mode | — | Old preview revoked when switching to URL | ✅ |

No memory leaks found. All revoke calls happen at the correct lifecycle moments.

### Part 3: Image Render Attributes

| Image | `width`/`height` | `loading` | `decoding` | Notes |
|-------|------------------|-----------|------------|-------|
| Profile photo | 64×64 | eager | async | Above the fold, critical |
| Project carousel (first 3) | 600×400 | eager | async | Visible on load |
| Project carousel (rest) | 600×400 | lazy | async | Below the fold |
| Cert thumbnails | 400×300 | lazy | async | Grid, below fold |
| Cert lightbox image | 900×700 | — | async | Modal, loaded on demand |
| Cert strip thumbnails | 60×45 | lazy | async | Small, decorative |
| Admin preview | auto | — | async | Admin only |

**CLS impact:** All images now have explicit `width`/`height` attributes, allowing the browser to reserve space before the image loads. This eliminates layout shift for project and certificate images.
