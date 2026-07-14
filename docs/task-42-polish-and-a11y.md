# Task 42 — Admin + Certificate UX Polish

## Part 1: Admin Panel ARIA + Keyboard

### Tab ARIA Wiring
- Each tab gets: `id="tab-{id}"`, `role="tab"`, `aria-selected`, `aria-controls="panel-{id}"`, `tabIndex` (0 for active, -1 for inactive)
- Tablist: `role="tablist"`, `aria-label="Editor sections"`, `aria-orientation="horizontal"`
- Tabpanel: `id="panel-{id}"`, `role="tabpanel"`, `aria-labelledby="tab-{id}"`, `tabIndex={0}`

### Keyboard Navigation
- **ArrowRight/ArrowDown**: Move to next tab, wrap around
- **ArrowLeft/ArrowUp**: Move to previous tab, wrap around
- **Home**: Jump to first tab
- **End**: Jump to last tab
- Roving tabindex: only active tab is in tab order, others are `-1`
- Focus moves with arrow keys via `tabRefs.current[newIndex]?.focus()`

### Visual Focus
- All interactive elements get `focus-visible` styles with `outline: 2px solid var(--color-focus-ring)` + `outline-offset`
- Tab active indicator: `::after` pseudo-element with 2px bottom border
- Field inputs get `box-shadow` ring on focus-visible for extra clarity

## Part 2: Certificate Gallery Polish

### Card Hierarchy
- Grid: `minmax(200px, 1fr)` for balanced desktop + mobile
- Image height: 140px (was 120px) for better preview
- Placeholder: centered initial + name (instead of just text)
- Title: `0.8125rem` weight 600, issuer/date below
- Hover: `translateY(-2px)` lift + deeper shadow (0.8 opacity)

### Entry Point Quality
- Each card has `aria-label="View details: {title}"` for screen readers
- Cards are proper `<button>` elements (not divs)

## Part 3: Lightbox Dialog Accessibility

### Dialog ARIA
- `role="dialog"` + `aria-modal="true"` on the content container
- `aria-labelledby` points to title, `aria-describedby` points to description
- Separate scrim element (`cert-lightbox-scrim`) for backdrop click

### Focus Management
- On open: `requestAnimationFrame` → focus first focusable element inside dialog
- On close: restore focus to the button that triggered the lightbox (`prevFocus.current`)
- **Focus trap**: Tab/Shift+Tab cycles within dialog only
  - Shift+Tab on first focusable → jumps to last
  - Tab on last focusable → jumps to first

### Keyboard Support
- **Escape**: Closes dialog + returns focus
- **ArrowLeft/ArrowRight**: Navigate between certificates
- **Tab**: Cycles within dialog (focus trap)

### Thumbnail Strip
- `role="tablist"` with `aria-label="Certificate thumbnails"`
- Each thumb: `role="tab"`, `aria-selected`, `aria-label`
- Roving tabindex (only active thumb in tab order)

## Part 4: Detail View Visual Polish

### Image Area
- Height: `clamp(180px, 40vh, 360px)` — prominent but not overwhelming
- Placeholder: initial in rounded square + name below
- `object-fit: contain` for images

### Metadata
- Pill-shaped meta tags (20px radius, border)
- Issuer/date in muted color, credential gets "accent" variant (brighter text + stronger border)
- Description below, proper line-height

### Thumbnail Rail
- 52px square thumbs (was 48px) for better touch targets
- Active: solid white border
- Horizontal scroll, no scrollbar

### Footer
- Flex row: nav arrows left, counter right
- Arrow buttons: 32px with SVG chevrons
- Counter: `aria-live="polite"` for screen readers

## Bundle Impact
| File | Before | After | Delta |
|------|--------|-------|-------|
| main JS | 290.33 KB | 292.39 KB | +2.06 KB |
| admin JS | 11.49 KB | 12.32 KB | +0.83 KB |
| CSS | 27.73 KB | 29.74 KB | +2.01 KB |
