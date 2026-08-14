# Layout Shell Fix — Task 25

## Overview

Fixed the portfolio shell to fill the viewport better across screen sizes and restored sidebar scrolling.

## Changes

### Grid Shell
- **Before:** `grid-template-columns: 280px 1fr`
- **After:** `grid-template-columns: clamp(240px, 22vw, 280px) minmax(0, 1fr)`

The `clamp()` function makes the sidebar responsive:
- Minimum: 240px (narrow screens)
- Preferred: 22vw (scales with viewport)
- Maximum: 280px (wide screens)

The `minmax(0, 1fr)` ensures the main content fills available space without overflow.

### Sidebar Scrolling
- **Before:** `height: 100vh`
- **After:** `height: 100dvh`

`100dvh` (dynamic viewport height) handles mobile browser chrome better than `100vh`.

Added `overflow-y: auto` to enable independent scrolling when content exceeds viewport.

On tablet/mobile, changed to `overflow-y: visible` since the sidebar stacks above content.

### Main Content
- **Before:** `max-width: 1000px; padding: 40px 80px`
- **After:** `max-width: 1100px; padding: 40px clamp(40px, 6vw, 100px)`

The `clamp()` on padding makes the content area responsive:
- Minimum padding: 40px
- Preferred: 6vw (scales with viewport)
- Maximum: 100px

### Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| >1024px | Side-by-side, responsive sidebar width |
| ≤1024px | Single column, sidebar stacks above |
| ≤768px | Compact spacing, vertical project cards |

## Files Changed
- `src/styles/global.css` — grid template, sidebar, main content, responsive breakpoints

## Design Principles
- No `overflow-x: hidden` hacks
- Layout-correct fixes only
- Responsive using `clamp()` and `minmax()`
- Preserves monochrome palette and cursor behavior
