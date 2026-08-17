# Task 27: Visual Simplification Pass

## Summary
Reduced visual weight across the portfolio to achieve an editorial, resume-like feel. Removed excess padding, simplified card styles, reduced typography scale, and cleaned up floating nav.

## Changes

### Sidebar
- Width narrowed to `clamp(260px, 22vw, 300px)` (was `clamp(320px, 26vw, 360px)`)
- Name font reduced to `1.6rem` (was `1.8rem`)
- Description font reduced to `0.8rem` (was `0.85rem`)
- Role font reduced to `0.75rem` (was `0.8rem`)
- Avatar size reduced to `64px` (was `76px`)
- Social link font reduced to `0.7rem` (was `0.75rem`)
- Social link padding reduced to `6px 10px`
- Skills gap reduced to `6px` (was `8px`)

### Main Content
- Section heading size reduced to `1.3rem` (was `1.5rem`)
- Content section margin reduced to `36px` (was `48px`)

### Project Cards
- Converted from horizontal rail to vertical editorial stack
- Image wrapper height reduced to `80px` (was `160px`)
- Image wrapper width set to `120px`
- Card padding reduced to `var(--space-5)`
- Meta tag padding simplified to `2px 6px`
- Meta tag border removed

### Experience/Education Cards
- Background changed to `transparent` (was `var(--color-surface)`)
- Padding reduced to `var(--space-4)`
- Education icon size reduced to `40px` (was `48px`)

### Floating Nav
- Padding reduced to `8px 12px` (was `12px 20px`)
- Icon size reduced to `32px` (was `40px`)
- Bottom position reduced to `24px` (was `32px`)
- Border radius reduced to `24px` (was `40px`)
- Background opacity reduced to `0.92` (was `0.95`)
- Backdrop blur reduced to `8px` (was `10px`)

### Buttons
- Padding reduced to `8px 16px` (was `10px 20px`)
- External button padding reduced to `4px 8px`
- External button hover: text color change only (no background)

### Footer
- Top margin reduced to `56px` (was `60px`)
- Text color changed to `var(--color-text-faint)` (was `var(--color-text-muted)`)

### Responsive
- Tablet sidebar padding reduced to `var(--space-5)`
- Tablet main content padding reduced to `var(--space-6)`
- Mobile nav icon size reduced to `28px` (was `36px`)
- Mobile main content padding-bottom reduced to `80px` (was `100px`)

## Design Rationale
- Editorial feel: less chrome, more content
- Resume-like: transparent cards, subtle borders, clean typography
- Reduced visual noise: smaller avatars, tighter spacing, muted interactions
- Professional tone: less decorative, more functional
