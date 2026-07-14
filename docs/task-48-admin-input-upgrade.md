# Task 48 — Admin Input Upgrade Summary

## New Shared Primitives

| Component | Purpose | Used By |
|-----------|---------|---------|
| `ImageField` | File upload + preview + URL input + remove | Projects (coverImage), Certifications (image) |
| `Toggle` | Boolean on/off switch with label | Available for enabled/featured fields |
| `UrlField` | URL-type text input | Projects (link), Contact (href) |
| `Field` (existing) | Text/textarea/color/url input | All sections |

## Field Patterns by Section

### Projects
| Field | Control | Notes |
|-------|---------|-------|
| Title | `Field` (text) | — |
| Icon | `Field` (text) | Lucide icon name string |
| Description | `Field` (textarea) | multiline |
| Tags | `Field` (text, comma-separated) | Parsed to array on change |
| Cover Image | `ImageField` | File upload + URL + preview + remove |
| Image Alt Text | `Field` (text) | — |
| Color | `Field` (color) | Native color picker |
| Link | `UrlField` | `type="url"` for mobile keyboard |

### Experience
| Field | Control | Notes |
|-------|---------|-------|
| Role | `Field` (text) | — |
| Company | `Field` (text) | — |
| Location | `Field` (text) | — |
| Period | `Field` (text) | Free-form date range |
| Description | `Field` (textarea) | multiline |

### Education
| Field | Control | Notes |
|-------|---------|-------|
| Institution | `Field` (text) | — |
| Degree | `Field` (text) | — |
| Location | `Field` (text) | — |
| Period | `Field` (text) | Free-form date range |
| Description | `Field` (textarea) | multiline |

### Skills
| Field | Control | Notes |
|-------|---------|-------|
| Categories | `Field` (textarea) | "Category: Skill" format, one per line |

### Certifications
| Field | Control | Notes |
|-------|---------|-------|
| Title | `Field` (text) | — |
| Issuer | `Field` (text) | — |
| Date | `Field` (text) | Free-form date range |
| Credential | `Field` (text) | — |
| Description | `Field` (textarea) | multiline |
| Certificate Image | `ImageField` | File upload + URL + preview + remove |
| Image Alt Text | `Field` (text) | — |

### Contact
| Field | Control | Notes |
|-------|---------|-------|
| CTA Text | `Field` (textarea) | multiline |
| Label | `Field` (text) | — |
| Value | `Field` (text) | — |
| Href | `UrlField` | `type="url"` for mobile keyboard |

### Raw JSON
| Field | Control | Notes |
|-------|---------|-------|
| JSON | `textarea` (field-json) | Monospace, full editor |

## Image Export Strategy

Same as Task 47 — data URL embedding:
- `fileStore` holds `File` objects by item id (shared across Projects + Certifications)
- `handleExport` iterates both `projects` and `certifications` items
- Each stored file → `FileReader.readAsDataURL()` → base64 data URL
- Exported `portfolio.js` is self-contained

## CSS Changes

- Added: `.toggle-*` styles (track, thumb, input, label)
- Added: `.image-*` styles (preview, controls, file button, remove)
- Removed: `.cert-image-*` and `.cert-file-*` styles (replaced by shared)
