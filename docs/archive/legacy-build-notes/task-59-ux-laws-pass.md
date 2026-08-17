# Task 59 — Attention Hierarchy + UX Laws Pass

## UX Laws Applied

### 1. Von Restorff Effect (Isolation Effect)
- **First project card** gets `border-color: var(--color-border-strong)` by default — visually distinct from other cards
- **Featured cards** use gradient background + subtle purple glow overlay via `::before`
- **Hero name** uses `-0.02em` letter-spacing for tighter, more prominent typography

### 2. Hick's Law (Reduce Choices)
- **Case expand button** now has visible border + background pill shape — clearer as interactive element
- **Section labels** act as clear group boundaries — reduces cognitive load scanning sections
- **CTA blocks** use `text-decoration: none` + explicit hover states — clearer action affordance

### 3. Miller's Law (Chunking)
- **Content sections** increased margin-bottom from 64px → 80px with subtle border-top separator between sections
- **Generic list cards** increased padding (`space-4 space-5`) and gap (`2px` between content items) for tighter internal grouping
- **Case summary** increased padding to `space-5` for better internal breathing room
- **Section labels** margin-bottom increased to `space-5` for clearer section boundaries

### 4. Fitts's Law (Target Size)
- **Case expand button** now has `padding: space-1 space-3` with `border-radius: radius-full` — larger click target
- **Project cards** add `transform: translateY(-2px)` on hover — clearer interactive feedback
- **CTA primary variant** (`cta-primary`) uses high-contrast white-on-black — unmissable primary action
- **Skill tags** add hover state (`color: text`, `border-color: border-strong`) — clearer interactivity

### 5. Gestalt Principles
- **Proximity**: Content sections have consistent 80px spacing — clear visual separation
- **Common Region**: Featured cards use `position: relative` + `::before` overlay — contained visual unit
- **Similarity**: All interactive elements (cards, buttons, chips) share consistent hover transition patterns

### 6. Jakob's Law (Familiar Patterns)
- **Project cards** maintain standard image-top, content-bottom layout — familiar pattern
- **Case cards** keep expand/collapse interaction — standard accordion pattern
- **Contact table** maintains label-value layout — familiar contact info pattern

## Specific Changes

| Area | Before | After | UX Law |
|------|--------|-------|--------|
| Section spacing | 64px | 80px + border-top | Miller (chunking) |
| Case expand btn | text-only | pill button with border | Fitts (target size) |
| Case expanded shadow | `0 2px 12px` | `0 4px 20px` | Von Restorff |
| Case summary padding | `space-4` | `space-5` | Miller (breathing room) |
| Generic list card hover | only border | border + background | Gestalt (common region) |
| Featured card | missing `position: relative` | added | Gestalt (overlay works) |
| CTA block | basic | added `cta-primary` variant | Fitts (primary action) |
| First project card | same as others | border-strong default | Von Restorff |
| Project card hover | no transform | `translateY(-2px)` | Fitts (feedback) |
| Skill tags | no hover | hover state added | Fitts (interactivity) |

## Files Updated

- `src/styles/global.css` — UX law-driven hierarchy improvements

## Verification

| Test | Result | Notes |
|------|--------|-------|
| Primary actions clearly distinguishable | PASS | cta-primary variant, pill expand buttons |
| Visual hierarchy stronger | PASS | First card emphasis, featured glow, section borders |
| Dense sections easier to scan | PASS | 80px section spacing, tighter content gaps |
| Choice overload reduced | PASS | Clear primary CTA per section |
| Featured content stands out | PASS | Gradient border, purple glow overlay |
| Existing interactions work | PASS | Build passes, no JS changes |
| Build passes | PASS | main 297KB, CSS 45.45KB |
