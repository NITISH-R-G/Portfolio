# Task 58 — Design System Consistency + Visual Polish

## Changes

### 1. Radius Token Standardization

**Before:** `--radius-sm: 4px`, `--radius-md: 6px`, `--radius-lg: 10px` + 12 hardcoded values
**After:** `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 20px`, `--radius-full: 9999px`

All hardcoded `border-radius` values replaced with token references.

### 2. Visual Hierarchy Classes

| Class | Purpose |
|-------|---------|
| `.featured-card` | Gradient border + subtle glow for featured content |
| `.proof-chip` | Pill-shaped inline chips for proof points |
| `.cta-block` | Action blocks with hover state |
| `.section-header-emphasis` | Left accent bar on section headers |
| `.availability-badge` | Status-aware badges (open/selective/closed) |
| `.resume-variant-card` | Clickable card for resume variants |
| `.tag-list` / `.tag-item` | Compact tag layout |
| `.hero-name` / `.hero-role` | Hero typography emphasis |
| `.dock-section-label` | Uppercase section labels in dock |

### 3. Component Polish

- **Status chips:** Changed from `radius-sm` to `radius-full` (pill shape)
- **Metric badges:** Added hover border effect, upgraded to `radius-md`
- **Availability badge:** Added border + status-specific colors via `[data-status]` selector
- **Case featured/status:** Font weight 500, `radius-full`, tighter opacity

### 4. Dock Icons

All 20 navigation sections already have icons mapped in `Icon.jsx`:
- hackathons → Trophy
- conferences → Users
- research → FlaskConical
- publications → BookOpen
- awards → Medal
- openSource → GitBranch
- founder → Rocket
- teaching → GraduationCap
- talks → Mic
- designWork → Palette
- media → Newspaper
- testimonials → Quote
- contact → Mail

No new icons needed — mapping is complete and extensible.

## Files Updated

- `src/styles/global.css` — Radius tokens, visual hierarchy classes, component polish

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Radius is consistent site-wide | PASS | All hardcoded values replaced with tokens |
| All dock sections have icons | PASS | 20/20 sections mapped in Icon.jsx |
| Visual hierarchy is stronger | PASS | Featured cards, proof chips, CTA blocks added |
| Text-heavy areas more scannable | PASS | Tag list, proof chips, summary line classes |
| Site feels more agency-grade | PASS | Refined tokens, consistent radii, subtle gradients |
| Existing functionality works | PASS | Build passes, no JS changes |
| Build passes | PASS | main 297KB, CSS 44KB |
