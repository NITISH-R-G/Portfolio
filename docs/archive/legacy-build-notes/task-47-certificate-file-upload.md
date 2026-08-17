# Task 47 — Certificate Image File Upload in Admin

## Chosen Export Strategy: Option A — Data URL Embedding

**Strategy:** Uploaded files are stored in memory during the admin session. On "Download JS", each stored file is converted to a base64 data URL and embedded directly in the exported `portfolio.js`. This makes the exported file self-contained — no external files needed.

**Why this works best:**
- The exported `portfolio.js` works anywhere without extra file management
- Certificate images are typically small (jpg/png), so data URL bloat is acceptable
- No server required, no file placement instructions to remember
- The public portfolio renders data URLs identically to regular URLs

**Tradeoffs acknowledged:**
- Data URLs increase the exported file size (~33% overhead from base64)
- Uploaded images preview locally via `URL.createObjectURL()` — these ephemeral URLs don't persist across page reloads, but the data URL export does
- Save Draft stores metadata only (image URLs/paths), not the file data itself

## What Was Built

### Admin CertificationsEditor
- **File input:** `<input type="file" accept="image/*">` with styled label button
- **Preview:** Immediate preview via `URL.createObjectURL()` after file selection
- **Remove:** X button on preview to clear image
- **Dual input:** Both file upload and URL text field — either works, last one wins
- **Helper text:** Explains that uploaded files are embedded as data URLs on download

### Export Flow
- `handleExport` is now async
- Before generating the JS file, it iterates through certifications
- For each cert with a stored file, reads it as base64 data URL via `FileReader`
- Replaces the `image` field with the data URL in the exported data
- Original cert data (including URL) is preserved in `Save Draft`

### Object URL Cleanup
- Preview object URLs are revoked when: image is removed, replaced, or cert is deleted
- `fileStore` map holds `File` objects keyed by cert id
- CertificationsEditor cleans up on unmount (via removeItem path)

## Files Updated
- `src/admin/AdminEditor.jsx` — CertificationsEditor rewrite, fileStore, async export, fileToDataUrl
- `src/styles/global.css` — cert image preview/upload/remove styles
- `docs/task-47-certificate-file-upload.md` — this file
- `docs/task-47-verification.md` — verification checklist
- `build-log.md` — task entry
