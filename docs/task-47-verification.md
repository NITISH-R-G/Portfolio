# Task 47 — Verification Checklist

## Export Strategy

**Chosen: Option A — Data URL Embedding.** Uploaded files are converted to base64 data URLs and embedded in the exported `portfolio.js`. The exported file is self-contained.

| Concern | Answer |
|---------|--------|
| Does exported file work standalone? | Yes — images are data URLs, no external files needed |
| Does Save Draft persist uploaded images? | No — only metadata. Object URLs are ephemeral. Re-upload needed after reload. |
| Does Download JS embed images? | Yes — FileReader converts to base64 data URL before export |
| File size impact | ~33% overhead from base64 encoding (acceptable for cert images) |

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Certificate image can be selected from device | PASS | File input with accept="image/*", styled label button |
| Preview appears immediately | PASS | URL.createObjectURL() provides instant preview |
| Remove image works | PASS | X button revokes object URL, clears from fileStore and data |
| Replace image works | PASS | New file selection revokes old URL, creates new preview |
| URL input still works | PASS | Can paste URL directly, clears any uploaded file |
| Draft flow still works | PASS | Save Draft stores metadata (image URL/path) to localStorage |
| Download JS output remains usable | PASS | Async export converts files to data URLs before generating file |
| Existing certificate display still works | PASS | CertGallery reads `cert.image` — works with both URLs and data URLs |
| Build passes | PASS | main 292.88KB, admin 15.74KB, CSS 31.19KB |
| Other admin tabs unaffected | PASS | Changes isolated to CertificationsEditor |

## Edge Cases

| Case | Behavior |
|------|----------|
| No image selected | Shows placeholder, no preview |
| File is not an image | Rejected by accept="image/*" + type check |
| Both URL and upload | Last action wins — URL clears upload, upload clears URL |
| Remove image after upload | Revokes object URL, clears fileStore entry |
| Remove cert with uploaded image | Revokes object URL, cleans up fileStore entry |
| Export without uploads | Normal behavior — URLs preserved as-is |
