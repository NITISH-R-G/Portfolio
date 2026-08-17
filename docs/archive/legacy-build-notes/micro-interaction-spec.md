# Micro-interaction Specification

**Date:** 2026-07-13
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion + GSAP + Lenis

---

## Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `ease-out-expo` | `[0.16, 1, 0.3, 1]` | Cursor, cards, nav, buttons |
| `ease-out-quart` | `[0.25, 1, 0.5, 1]` | Section reveals |
| `spring-nav` | `{ stiffness: 380, damping: 32, mass: 0.65 }` | Nav pill indicator |
| `spring-button` | `{ stiffness: 400, damping: 20 }` | Social/nav icons |
| `spring-card` | `{ stiffness: 300, damping: 25 }` | Project card hover |
| `spring-avatar` | `{ stiffness: 300, damping: 20 }` | Profile photo |
| Duration fast | 140ms | Micro-interactions |
| Duration base | 260ms | Standard transitions |
| Duration slow | 520ms | Section reveals |

---

## Cursor System

### Enable Conditions
- `pointer: fine` (not touch)
- `hover: hover` (not touch device)
- `window.innerWidth >= 1024` (desktop)
- `reducedMotion === false`

### Elements
| Element | Size | Color | Behavior |
|---------|------|-------|----------|
| Dot | 6px | Accent | Near-immediate (0.35 lerp factor) |
| Ring | 28px | Accent | Soft follow (0.08 lerp factor) |
| Label | 12px | Foreground | Appears on project card hover |

### Interactive State
| Target | Ring Scale | Dot Opacity | Border Color |
|--------|-----------|-------------|--------------|
| Default | 1.0 | 1.0 | Accent |
| Interactive | 1.45 | 0.6 | Accent |
| Project Card | 1.0 | 1.0 | Accent |

### Movement
- `transform: translate3d(x, y, 0)` only
- RAF-driven single loop
- Cleanup: cancel RAF, remove elements, remove body class

---

## Floating Navigation

### Active Indicator
- `layoutId: "portfolio-nav-active-indicator"`
- Spring: `{ stiffness: 380, damping: 32, mass: 0.65 }`
- Background: `rgba(139, 92, 246, 0.18)`
- Border: `1px solid var(--accent)`
- Box shadow: `0 0 16px rgba(139, 92, 246, 0.25)`

### Item Interactions
| State | Scale | Color |
|-------|-------|-------|
| Default | 1.0 | Muted |
| Hover | 1.06 | Accent |
| Tap | 0.96 | Accent |
| Active | 1.0 | Accent |
| Focus-visible | 1.0 | Accent |

### Tooltip
- Delay: 250ms (desktop only)
- Position: `bottom: calc(100% + 8px)`, centered
- Animation: fade + slide up (8px)
- Duration: 150ms

---

## Project Cards

### Hover State
| Property | Value | Duration |
|----------|-------|----------|
| translateY | -4px | 280ms |
| scale | 1.005 | 280ms |
| border | accent glow | 280ms |
| shadow | subtle lift | 280ms |

### Image Hover
- Scale: 1.02
- Duration: 400ms

### Cursor
- `data-cursor="interactive"`
- Label: "View project" on hover

---

## Social Icons (Sidebar)

### Stagger Load
- Container: `staggerChildren: 0.08`
- Per icon: `delay: i * 0.03`
- Total stagger: ~120ms

### Hover State
| State | Scale | Border Color |
|-------|-------|--------------|
| Default | 1.0 | Border |
| Hover | 1.1 | Border hover |
| Tap | 0.95 | Border hover |

---

## Profile Avatar

### Hover State
- Rotate: 2deg
- Scale: 1.02
- Spring: `{ stiffness: 300, damping: 20 }`

---

## Button Variants

### Primary
- Background: Accent
- Color: Background
- Hover: `y: 1`

### Ghost
- Background: Transparent
- Border: 1px solid Border
- Hover: `y: 1`

### External
- Background: Transparent
- Color: Accent
- Hover: `x: 1, y: -1`
- Icon: 2px diagonal move

---

## Reduced Motion Behavior

When `prefers-reduced-motion: reduce`:
- All animations: `duration: 0.01ms`
- Cursor: disabled
- Lenis: disabled
- Section reveals: opacity only, instant
- Hover states: instant, no transform
- Nav indicator: instant position, no spring

---

## Performance Budget

| Asset | Gzipped | Budget |
|-------|---------|--------|
| JS | 159 KB | < 180 KB |
| CSS | 2.58 KB | < 10 KB |
| Total | 161.58 KB | < 200 KB |