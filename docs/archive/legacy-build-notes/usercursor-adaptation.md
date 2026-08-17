# Originkit UserCursor Adaptation

## Overview

This document tracks the adaptation of the Originkit-style UserCursor component for the React+Vite portfolio project.

## Reference Source

Originkit UserCursor — a spring-tracked arrow with a trailing label pill interaction pattern.

## Key Adaptations

### Removed from Framer-specific code
- `framer-motion` imports and `motion.div` wrappers
- Framer-specific static renderer logic
- TypeScript type annotations
- Framer motion value utilities

### Preserved behavior architecture
- Arrow cursor anchored at its tip (SVG-based)
- Trailing label pill with spring-based movement
- Label tilt based on horizontal velocity
- Press scale animation
- Surface scoping (only active inside `.portfolio-surface`)
- Native cursor preserved outside surface
- Touch/coarse-pointer gating
- Reduced-motion gating
- Portal rendering to prevent clipping
- `aria-hidden="true"` for accessibility

### New implementation approach
- Direct DOM manipulation for position updates (no React re-renders)
- `requestAnimationFrame` loop for smooth 60fps updates
- Spring math with separate stiffness/damping per element
- Velocity tracking from pointer move events
- Contextual labels via `data-cursor` attributes or class detection
- Class-based `.custom-cursor-active` for CSS cursor: none

## Implementation Details

### Arrow element
- SVG path: `M5 3L19 12L12 13L9 20L5 3Z` (classic arrow shape)
- White fill with subtle shadow stroke
- 20×20px viewport size
- Positioned at tip (top-left corner)
- Snappy spring: stiffness 0.25, damping 0.7

### Label element
- Rounded pill with 20px border-radius
- Background: `var(--accent, #8B5CF6)` (theme accent)
- White text, 12px font size
- Compact padding: 6px 12px
- Laggier spring: stiffness 0.12, damping 0.65
- Tilt: capped to ±15° based on horizontal velocity

### Position springs
- Arrow: `spring(current, target, 0.25, 0.7)`
- Label: `spring(current + offset, target, 0.12, 0.65)`
- Label offset: +20px from arrow (right-down)

### Velocity-based tilt
- Calculated from pointer move delta / time delta
- Capped to ±15° maximum
- Applies to label only, not arrow
- Smooth spring toward target tilt angle

### Press feedback
- Scale down to 0.9 on pointerdown
- Spring back to 1 on pointerup
- Both arrow and label scale together

### Contextual labels
- Default: "Nitish R.G."
- Project cards: "View project"
- Social/external links: "Open link"
- Nav items: "Navigate"
- Fallback: "Nitish R.G."

## Files Created
- `src/components/UserCursor.jsx` — Main component
- `docs/usercursor-adaptation.md` — This file
- `docs/task-23-verification.md` — Verification results

## Files Updated
- `src/App.jsx` — Replaced CursorFollower with UserCursor

## Architecture Notes
- No new dependencies required
- Uses existing Motion library for other components
- Uses existing reduced-motion hook
- Uses existing desktop-only cursor eligibility logic
- Uses existing `.portfolio-surface` wrapper
