# Cursor Bug Analysis

**Date:** 2026-07-13
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion

---

## Bug Description

The custom cursor works outside the portfolio website but disappears inside the portfolio surface. The native browser cursor is hidden immediately when the CursorFollower component mounts, even before the custom cursor is visible.

---

## Root Cause

### 1. CSS Selector Applying `cursor: none`

**File:** `src/styles/global.css`, line 73-75

```css
body.has-custom-cursor * {
  cursor: none !important;
}
```

This rule hides the native cursor for ALL elements when the body has the `has-custom-cursor` class.

### 2. When the Class Becomes Active

**File:** `src/components/CursorFollower.jsx`, line 91

```js
document.body.classList.add('has-custom-cursor')
```

This is called inside `createElements()`, which runs immediately when:
- Component mounts
- `checkEnabled()` returns true (desktop, pointer-fine, not reduced-motion)

The class is added BEFORE any pointer move event fires.

### 3. Why Native Cursor Becomes Hidden

The CSS rule `body.has-custom-cursor * { cursor: none !important; }` applies immediately when the class is added. This hides the native cursor across the entire page.

### 4. Why Custom Visual Cursor Is Not Visible

The custom cursor elements (dot, ring) are created with:
- Initial position at viewport center (0,0 or window center)
- Opacity set to 0 initially
- `visibility` not explicitly set (defaults to visible, but positioned off-screen)

The cursor elements only become visible after:
1. First `mousemove` event fires
2. `handleMouseMove` sets `isVisibleRef.current = true`
3. Opacity transitions to 1

Between mount and first pointer move, the user sees NO cursor.

---

## Chosen Fix

### A. Rename class to `custom-cursor-active`

Use a more descriptive class name that indicates the cursor is actively being displayed.

### B. Delay class addition until first valid pointer move

Only add `custom-cursor-active` class AFTER:
1. Custom cursor is enabled
2. Pointer is inside the portfolio surface
3. First valid `pointermove` event with finite x/y coordinates
4. Custom cursor elements are visible

### C. Make CSS conditional on active state

```css
body.custom-cursor-active .portfolio-surface,
body.custom-cursor-active .portfolio-surface a,
body.custom-cursor-active .portfolio-surface button {
  cursor: none;
}
```

### D. Preserve native cursor for text selection

```css
body.custom-cursor-active .portfolio-surface p,
body.custom-cursor-active .portfolio-surface h1,
body.custom-cursor-active .portfolio-surface input {
  cursor: text;
}
```

### E. Remove class on pointerleave

When pointer leaves the portfolio surface, immediately remove the class to restore native cursor.

---

## Fallback Behavior

At all times, the native cursor must be visible unless ALL conditions are true:

1. Custom cursor is enabled (desktop, pointer-fine, not reduced-motion)
2. Pointer is currently inside `.portfolio-surface`
3. Pointer has moved at least once within the surface
4. The custom cursor has received valid finite x/y coordinates
5. The browser viewport is visible

When any condition is false:
- Remove `custom-cursor-active` class
- Native cursor becomes visible immediately

---

## Files to Modify

1. `src/styles/global.css` — Replace `has-custom-cursor` with `custom-cursor-active`, scope to `.portfolio-surface`
2. `src/components/CursorFollower.jsx` — Delay class addition, add pointerenter/leave tracking, use portal
3. `src/App.jsx` — Add `.portfolio-surface` wrapper, pass ref to CursorFollower

---

## Verification

After fix:
- Initial load: native cursor visible
- First pointer move into surface: custom cursor appears, native hides
- Leave surface: native cursor returns
- Re-enter: custom cursor works again
- Resize below 1024px: custom cursor absent, native works
- Reduced motion: custom cursor absent, native works
- Text selection: native text cursor works
- All interactions: clicks, scrolls, keyboard focus unaffected