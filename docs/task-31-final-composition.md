# Task 31: Final Composition Nudge

## Summary
Reduced carousel dominance and improved overall page balance. The active card is now proportioned to feel featured without overwhelming the page, and vertical spacing between sections is improved.

## Changes

### Carousel Sizing
- Active card width: `clamp(300px, 55%, 460px)` (was `clamp(320px, 65%, 520px)`)
- Viewport height: `clamp(320px, 36vw, 420px)` (was `clamp(360px, 42vw, 480px)`)
- Image area: `clamp(150px, 18vw, 210px)` (was `clamp(180px, 22vw, 260px)`)

### Section Spacing
- Content section margin: 64px (was 56px)
- Main content padding-bottom: 160px (was 120px)

### Floating Nav
- Bottom position: `var(--space-8)` (was `var(--space-6)`) — more breathing room

### Responsive
- Tablet: viewport 280-380px, image 140-200px
- Mobile: viewport 300-380px, card 78% width, image 130-170px

## Design Rationale
- Active card was too dominant relative to the rest of the page
- Floating nav was crowding the projects section
- Vertical rhythm between sections needed improvement
- Carousel is still featured but no longer overpowering
