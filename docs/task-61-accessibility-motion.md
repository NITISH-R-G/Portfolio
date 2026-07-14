# Task 61 — Accessibility + Motion Correctness Pass

## Changes

### 1. Expand/Collapse Controls (CaseStudyCard)
- Added `useId()` hook for unique ID generation
- Added `aria-controls={detailsId}` to expand button
- Added `id={detailsId}` to details container
- `aria-expanded` was already present

### 2. Focus Visibility
- Added `focus-visible` style for `.case-expand-btn` (outline 2px, offset 2px)
- Added `focus-visible` style for `.generic-list-link` (outline 2px, offset 2px, padding, border-radius)
- Added `focus-visible` style for `.field-group-summary` (admin disclosure toggle)
- Existing focus styles verified comprehensive (48 focus-visible rules)

### 3. Admin Sidebar Accessibility
- Added Escape key handler to close sidebar on mobile
- Sidebar already had: `aria-label="Editor sections"`, `aria-current="page"`, `aria-expanded` on toggle
- FieldGroup uses native `<details>/<summary>` (good semantic pattern)

### 4. Dock Accessibility
- Fixed `aria-current` from `"true"` to `"page"` (proper value)
- Dock already had: `role="toolbar"`, `aria-label`, keyboard Enter/Space handling
- Focus/blur handlers show/hide labels for keyboard users

### 5. Reduced Motion
- CSS: `animation-duration: 0.01ms !important`, `transition-duration: 0.01ms !important`
- CSS: `scroll-behavior: auto`
- CSS: `.content-section` opacity: 1, transform: none
- JS: All components check `useReducedMotion()` and disable motion accordingly
- Dock: Magnification disabled, labels only show on focus (not hover)
- Cursor: Disabled entirely on reduced-motion
- CertGallery: Passes `reducedMotion` prop to disable animations

### 6. Keyboard Accessibility
- ProjectCarousel: `tabIndex={0}`, `role="list"`, ArrowLeft/Right for scrolling
- Dock: Enter/Space for activation, focus shows labels
- Admin: ArrowUp/Down/Home/End for nav, Escape closes sidebar
- All links use native `<a>` tags (keyboard accessible by default)

### 7. Semantic HTML
- CaseStudyCard: `<button>` for expand, `<div>` for card (correct)
- ProjectCarousel: `<motion.a>` for cards (correct — links)
- GenericListItem: `<div>` with `<a>` inside (correct)
- Admin FieldGroup: `<details>/<summary>` (native disclosure)
- Sections: `<motion.section>` with `<h2>` headings

## Files Updated

- `src/components/CaseStudyCard.jsx` — Added useId, aria-controls, id on details
- `src/components/Dock.jsx` — Fixed aria-current="page"
- `src/admin/AdminEditor.jsx` — Added Escape key handler for sidebar
- `src/styles/global.css` — Added focus-visible for case-expand-btn, generic-list-link, field-group-summary

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Expand/collapse controls accessible | PASS | aria-expanded + aria-controls + id |
| Focus order predictable | PASS | Tab order follows visual order |
| Visible focus strong | PASS | 2px solid white ring on all interactive elements |
| Cards/actions keyboard accessible | PASS | Links use <a>, buttons use <button> |
| Reduced-motion respected | PASS | CSS !important + JS useReducedMotion() |
| Hover-only meaning has alternative | PASS | Labels show on focus, :active for touch |
| Admin overlay/sidebar accessible | PASS | Escape closes, aria labels present |
| Build passes | PASS | main 297KB, CSS 47.21KB |
