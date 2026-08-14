# Task 45 — Dock Click Fix

## Root Causes Found

1. **Non-semantic element** — Dock items were `motion.div` with `role="button"`, not real `<button>` elements. No native click/keyboard behavior.
2. **onClick on wrong layer** — `onClick` was on inner `dock-icon` div, not the outer dock item. If the label or any overlay sat above, clicks would miss.
3. **No keyboard activation** — No `onKeyDown` handler for Enter/Space.
4. **No scroll navigation** — `onNavigate` only announced the section name to screen readers; it didn't actually scroll to the section.
5. **Label tooltip** — Already had `pointer-events: none` (good), but the overall architecture was still fragile.

## Changes Made

### Dock.jsx
- Changed outer element from `motion.div` to `motion.button` with `type="button"`
- Moved `onClick` from inner `dock-icon` to the button itself
- Added `handleClick` that both announces AND scrolls to the section via `scrollIntoView`
- Added `handleKeyDown` for Enter/Space activation (redundant with native button, but explicit)
- Added `aria-hidden="true"` to label and icon (button provides the accessible name)
- Removed `tabIndex={0}` (native buttons are already focusable)
- Removed `role="button"` (native button has implicit role)

### global.css
- Added button reset styles to `.dock-item`: `background: none`, `border: none`, `padding: 0`, `font: inherit`, `color: inherit`, `-webkit-tap-highlight-color: transparent`

## Behavior After Fix
| Action | Before | After |
|--------|--------|-------|
| Click dock item | Only works if click lands exactly on icon div | Works anywhere on the item |
| Enter key | Nothing | Scrolls to section + announces |
| Space key | Nothing | Scrolls to section + announces |
| Focus visible | outline on div (unreliable) | outline on native button (reliable) |
| Navigate | Only announces | Announces + scrolls with smooth behavior |
