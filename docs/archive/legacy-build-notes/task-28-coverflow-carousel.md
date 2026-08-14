# Task 28: Coverflow Carousel

## Summary
Restored the projects section as an Originkit-style coverflow carousel. Replaced the flat vertical stack (Task 27 regression) with an interactive, animated carousel featuring a centered active card with compressed neighbor slats.

## Architecture
- `src/components/ProjectsCoverflow.jsx` — main carousel component
- Uses Motion primitives: `useMotionValue`, `useTransform`, `animate`
- Derived transforms: position, scale, rotateY, opacity, zIndex from active index
- Spring-based transitions (stiffness 260, damping 28, mass 0.8)

## Interaction Model
- **Active card**: centered, full scale (1.0), no rotation, full opacity
- **Neighbors**: compressed to 65-78% scale, rotated ±25°, reduced opacity
- **Controls**: left/right arrows + dot indicators
- **Keyboard**: ArrowLeft/ArrowRight navigation
- **Click**: click any card to make it active
- **Reduced motion**: instant transitions, no spring animation

## Responsive Behavior
- **Desktop** (≥1024px): full coverflow, active card 55% width, 420px height
- **Tablet** (768-1023px): slightly smaller, 360px height
- **Mobile** (<768px): simplified single-card slider, 75% width, 380px height

## Design Language
- Monochrome: black/white/gray UI
- No saturated gradients or neon
- Subtle neutral placeholders for project visuals
- Premium, calm card styling
- Metadata chips remain quiet

## Files Changed
- Created: `src/components/ProjectsCoverflow.jsx`
- Updated: `src/components/MainContent.jsx` (import + integration)
- Updated: `src/styles/global.css` (coverflow styles, responsive)
- Created: `docs/task-28-coverflow-carousel.md`
- Created: `docs/task-28-verification.md`
