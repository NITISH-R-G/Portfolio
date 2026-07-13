# Visual System Specification

**Date:** 2026-07-13
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion

---

## Type Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--text-hero` | `clamp(1.75rem, 4vw, 2.25rem)` | Profile name |
| `--text-section` | `clamp(0.6875rem, 1.2vw, 0.75rem)` | Section labels (INTRO, PROJECTS) |
| `--text-card-title` | `clamp(0.9375rem, 1.5vw, 1rem)` | Project card titles |
| `--text-body` | `0.875rem` | Body copy, descriptions |
| `--text-meta` | `0.75rem` | Tags, metadata, footer |
| `--tracking-label` | `0.1em` | Section label letter-spacing |
| `--leading-hero` | `1.2` | Hero title line-height |
| `--leading-body` | `1.6` | Body text line-height |
| `--leading-meta` | `1.4` | Metadata line-height |

### Font Stack
- Primary: `'Inter', system-ui, sans-serif`
- Single family, no fallback families
- Minimum text size: 12px (0.75rem)

### Hierarchy
```
Hero (profile name)     → 1.75-2.25rem, weight 600
Section label           → 0.6875-0.75rem, weight 600, uppercase, tracking 0.1em
Card title              → 0.9375-1rem, weight 600
Body                    → 0.875rem, weight 400
Metadata                → 0.75rem, weight 400
```

---

## Spacing Scale

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-7` | 32px |
| `--space-8` | 40px |

---

## Color Hierarchy

| Layer | Token | Value | Usage |
|-------|-------|-------|-------|
| 1. Page background | `--color-page` | `#0D0D0D` | Body background |
| 2. Sidebar panel | `--color-sidebar` | `#111111` | Sidebar background |
| 3. Card surface | `--color-surface` | `#1A1A1A` | Cards, elevated elements |
| 4. Card hover | `--color-surface-hover` | `#222222` | Card hover state |
| 5. Border | `--color-border` | `#2A2A2A` | Card borders, dividers |
| 6. Border strong | `--color-border-strong` | `#3A3A3A` | Hover borders |
| 7. Text | `--color-text` | `#FFFFFF` | Primary text |
| 8. Text muted | `--color-text-muted` | `#9A9A9A` | Secondary text |
| 9. Accent | `--color-accent` | `#8B5CF6` | Links, focus, active |
| 10. Focus ring | `--color-focus-ring` | `#8B5CF6` | Keyboard focus |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Tooltips, small badges |
| `--radius-md` | 8px | Buttons, social icons |
| `--radius-lg` | 12px | Cards, sections, sidebar |

---

## Icon System

### Sizes
| Context | Size | Example |
|---------|------|---------|
| Metadata | 16px | Education icon, contact icons |
| Navigation / Button | 18px | Nav pill, social icons, external link |
| Primary control | 20px | Major interactive controls |

### Lucide Requirements
- `strokeWidth={1.75}` on all Lucide icons
- `absoluteStrokeWidth={true}` for visual consistency across sizes
- `aria-hidden="true"` on decorative icons adjacent to visible text
- `aria-label` on all icon-only controls

### Social Icons
- Custom SVGs with `viewBox="0 0 24 24"`
- `width="18" height="18"` (consistent optical size)
- `fill="currentColor"` (inherits color from parent)
- `aria-hidden="true"` (parent `<a>` has `aria-label`)

---

## Project Rail Behavior

### Desktop (≥769px)
- Horizontal flex with `overflow-x: auto`
- `scroll-snap-type: x proximity` (smooth, non-jarring)
- `overscroll-behavior-x: contain` (prevents vertical scroll trap)
- `scrollbar-width: thin` (subtle visual)
- Cards partially clip at right edge (visual overflow cue)

### Mobile (≤768px)
- Vertical column layout (`flex-direction: column`)
- No horizontal scroll
- No scroll snap
- Full-width cards
- No cursor label

---

## Initial Load Sequence

### Desktop
1. **Sidebar** (0ms): opacity 0→1, x -12→0, 260ms
2. **Main content** (60ms delay): opacity 0→1, y 12→0, 260ms
3. **Nav pill** (120ms delay): opacity 0→1, y 6→0, 200ms

### Reduced Motion
- All elements: opacity 0→1, 100ms max
- No transforms

### Rules
- Content visible within 250ms max
- Single parent stagger, not per-element
- No replay on resize/hash/scroll

---

## Reduced Motion Behavior

When `prefers-reduced-motion: reduce`:
- `scroll-behavior: auto`
- All animations: `duration: 0.01ms`
- All transitions: `duration: 0.01ms`
- Content sections: `opacity: 1`, `transform: none`
- Cursor: disabled
- Lenis: disabled
- Hover states: instant, no transform