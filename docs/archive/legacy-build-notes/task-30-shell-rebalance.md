# Task 30: Shell Rebalance

## Summary
Fixed the shell proportions by widening the sidebar and removing the artificial max-width cap on main content. The page now has a stronger identity rail and the right side is no longer wasted space.

## Changes

### Grid Shell
- Sidebar: `clamp(320px, 26vw, 380px)` (was `clamp(260px, 22vw, 300px)`)
- Main content: removed `max-width: 800px` — now fills the grid column naturally

### Responsive Comments
- Updated breakpoint documentation to reflect new sidebar widths

## Design Rationale
- The sidebar was too narrow for its content (avatar, name, role, skills, languages, social links)
- The 800px max-width on main content was artificially capping the available width
- The carousel and other sections now expand to fill the available space
- The composition feels more balanced with a stronger left rail

## Layout Before
```
Grid: 260-300px sidebar | flex-1 main (capped at 800px)
Result: narrow sidebar, main content too centered, right side empty
```

## Layout After
```
Grid: 320-380px sidebar | flex-1 main (no cap)
Result: stronger sidebar, main content fills available width, balanced composition
```
