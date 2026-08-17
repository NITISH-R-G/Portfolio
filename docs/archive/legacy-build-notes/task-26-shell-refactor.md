# Task 26 — Astryx-Inspired Shell Refactor

## Overview

Refactored the portfolio layout to follow Astryx-inspired app shell principles: frame-first shell, explicit region budgets, scrolling contract, and responsive contracts.

## Astryx Adoption Decision

**PATH 2 — Use Astryx as design/layout reference only**

Reasoning:
- `@astryxdesign/core` is 13.8 MB unpacked — too heavy for a portfolio
- StyleX styling paradigm conflicts with existing CSS approach
- Component rewrite risk outweighs benefits
- Current monochrome palette already works well

See `docs/astryx-adoption-decision.md` for full reasoning.

## Shell Architecture

### Grid Template
```css
grid-template-columns: clamp(320px, 26vw, 360px) minmax(0, 1fr);
min-height: 100dvh;
```

### Region Budgets

| Region | Width | Behavior |
|--------|-------|----------|
| Sidebar | 320-360px | Sticky, scrollable |
| Main content | Flex remainder | Scrolls with page |

## Scrolling Contract

**Model A — Page scroll owns everything**

- Whole page scrolls
- Sidebar is sticky within page
- Sidebar internal scroll only if content exceeds viewport
- Main content scrolls with page

Chosen because:
- Simpler architecture
- Fewer nested scroll conflicts
- Smoother feel on desktop
- Sidebar scroll only activates when needed

## Responsive Contract

| Viewport | Layout |
|----------|--------|
| ≥1280px | Left panel 340-360px, content flex |
| 1024-1279px | Left panel 300-320px, content flex |
| 768-1023px | Single column, sidebar stacks above |
| <768px | Stack vertically, sidebar in document flow |

## Project Card Cleanup

- Removed `background: var(--color-surface)` from card body
- Cards now have transparent background
- Image wrapper uses `var(--color-surface)` as placeholder
- Metadata chips now have borders for editorial feel
- Reduced image height from 180px to 160px
- Added `max-width: 360px` to prevent over-stretching

## Files Changed
- `src/styles/global.css` — shell layout, scrolling, responsive contracts, project cards
- `docs/astryx-adoption-decision.md` — adoption reasoning
- `docs/task-26-shell-refactor.md` — this file

## Design Principles
- Frame-first shell
- Explicit region budgets
- Single scroll owner
- Contract-based responsive design
- Editorial, not "card soup"
