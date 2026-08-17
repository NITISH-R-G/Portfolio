# Task 29: Coverflow Polish

## Summary
Fixed the coverflow carousel's visual hierarchy and proportions. The active card is now clearly dominant, side cards are reduced to visual hints, the stage is wider, and controls are subtler.

## Changes

### Active Card
- Width: 65% (was 55%)
- Image area: 180-260px height (was 140-200px)
- Larger icon badge
- Full content: title, description, tags, CTA

### Side Cards (Slats)
- Scale: 0.72 (was 0.78), 0.58 for distant (was 0.65)
- Opacity: 0.55 (was 0.7), 0.25 for distant (was 0.4)
- Rotation: ±18° (was ±25°) — cleaner, less gimmicky
- Shift: 72% (was 65%) — more spread

### Stage
- Viewport height: 360-480px (was 320-420px)
- Overflow: visible (was hidden) — allows side cards to extend naturally
- Perspective: 1000px (was 1200px)

### Controls
- Arrow size: 28px (was 32px)
- Arrow icon: 16px (was 18px)
- Dot size: 5px (was 6px)
- Dot active color: text-muted (was text)
- More top margin (space-5 vs space-3)

### Responsive
- Tablet: viewport 320-420px, image 160-220px
- Mobile: viewport 340-420px, card 80% width, smaller text

## Design Rationale
- Active card must be the obvious hero
- Side cards are previews, not competing content
- Controls should be quiet, not noisy
- Section should feel premium, not widget-like
- Inactive cards: image only, no full body copy
