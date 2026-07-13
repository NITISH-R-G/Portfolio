# Monochrome Redesign — Task 24

## Overview

Replaced the purple/blue accent palette with a strict monochrome design and reworked the layout for full-width desktop usage.

## Color System

### New palette using `color-mix()`

```css
--color-bg: #0A0A0A;
--color-surface: color-mix(in srgb, #0A0A0A 88%, #FFFFFF);
--color-surface-2: color-mix(in srgb, #0A0A0A 80%, #FFFFFF);
--color-border: color-mix(in srgb, #0A0A0A 72%, #FFFFFF);
--color-border-strong: color-mix(in srgb, #0A0A0A 55%, #FFFFFF);
--color-text: #FFFFFF;
--color-text-muted: color-mix(in srgb, #FFFFFF 55%, #0A0A0A);
--color-text-faint: color-mix(in srgb, #FFFFFF 32%, #0A0A0A);
--color-focus-ring: color-mix(in srgb, #FFFFFF 70%, #0A0A0A);
```

### Removed tokens
- `--accent: #8B5CF6` (purple)
- `--accent-secondary: #38BDF8` (blue)
- `--color-accent` (replaced with `--color-text`)
- `--color-focus-ring` (now derived from white)

### Token mapping
| Old | New | Value |
|-----|-----|-------|
| `--color-accent` | `--color-text` | #FFFFFF |
| `--color-page` | `--color-bg` | #0A0A0A |
| `--color-surface` | `--color-surface` | 12% white mix |
| `--color-surface-hover` | `--color-surface-2` | 20% white mix |

## Layout Changes

### Grid template
- Old: `grid-template-columns: 320px 1fr`
- New: `grid-template-columns: 280px 1fr`

### Main content
- Old: `max-width: 860px; padding: 40px 60px`
- New: `max-width: 1000px; padding: 40px 80px`

### Sidebar
- Narrowed from 320px to 280px
- Reduced visual weight
- Main content area expanded

## Component Updates

### Buttons
- `.btn-primary`: white background, black text (was purple)
- `.btn-primary:hover`: white glow shadow (was purple glow)
- `.btn-external`: muted text, subtle hover (was purple text)

### Education icon
- Background: `--color-surface-2` (neutral gray)
- Was: `--color-accent` (purple)

### Project link
- Color: `--color-text-muted` (gray)
- Was: `--color-accent` (purple)

### Skip link
- Background: white, text: black
- Was: purple background

### Floating nav
- Background: `rgba(10, 10, 10, 0.95)` (darker)

### Cursor
- Arrow: white fill (unchanged)
- Pill: `rgba(255, 255, 255, 0.12)` (was purple #8B5CF6)
- Pill shadow: `rgba(0, 0, 0, 0.3)` (darker for contrast)

### Nav icon states
- Hover/active: `rgba(255, 255, 255, 0.1)` (was 0.15)

## Files Changed
- `src/styles/global.css` — color tokens, layout, component styles
- `src/components/UserCursor.jsx` — cursor pill background color

## Design Principles
- No purple, blue, teal, or gradient accents
- Monochrome palette derived from black + white via `color-mix()`
- Strong contrast for readability
- Borders, spacing, and type hierarchy over color
- Editorial, minimal, sharp aesthetic
