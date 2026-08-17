# Task 28: Verification Matrix

## Build
- [x] `npm run build` succeeds
- [x] CSS: 15.52 KB (3.39 KB gzipped) — within budget
- [x] JS: 487.19 KB (163.29 KB gzipped) — within budget

## Carousel Behavior
- [x] Projects restored as carousel (not vertical list)
- [x] Active center card emphasized (full scale, centered)
- [x] Side cards/slats visible (compressed, rotated, reduced opacity)
- [x] Motion smooth (spring transitions, no re-render thrash)
- [x] Keyboard nav works (ArrowLeft/ArrowRight)
- [x] Arrow controls functional (prev/next buttons)
- [x] Dot indicators functional (click to select)
- [x] Click on cards to focus them

## Accessibility
- [x] Reduced motion safe (instant transitions when prefers-reduced-motion: reduce)
- [x] ARIA roles: region, carousel, tablist, tab
- [x] aria-roledescription="carousel"
- [x] aria-label on cards and controls
- [x] Focus-visible outlines present
- [x] Keyboard navigation works

## Responsive
- [x] Desktop: full coverflow with center emphasis
- [x] Tablet: slightly smaller active card
- [x] Mobile: simplified single-card slider, still carousel (not stacked list)

## Design
- [x] Monochrome style preserved (no purple/blue reintroduction)
- [x] Project title and description readable
- [x] Tags visible and styled
- [x] Link/CTA present and functional
