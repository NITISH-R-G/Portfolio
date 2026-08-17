# Scroll & Animation Architecture

**Generated:** 2026-07-13  
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion + GSAP + Lenis

---

## Animation Ownership Matrix

| Animation Category | Owner | Implementation | Notes |
|--------------------|-------|----------------|-------|
| Section entrance (fade + slide) | **Motion** | `Section.jsx` → `whileInView` variants | Single source; `once: true`, `amount: 0.18` |
| Staggered sidebar children | **Motion** | `Sidebar.jsx` → container/item variants | 0.08s stagger |
| Floating nav active indicator | **Motion** | `FloatingNav.jsx` → `layoutId` on active pill | Spring: stiffness 380, damping 32, mass 0.65 |
| Nav/item hover/tap micro-interactions | **Motion** | `whileHover` / `whileTap` on interactive elements | Scale 1.06/0.96, border/color transitions |
| Project card hover lift | **Motion** | `ProjectCard.jsx` → `whileHover: { y: -4 }` | 220-320ms, `ease: [0.16, 1, 0.3, 1]` |
| Scroll-linked parallax (sidebar) | **GSAP** | `useScrollAnimation.js` → `gsap.to(sidebarRef, { yPercent: -10, ... })` | Desktop only, reduced-motion disabled |
| Project rail progress indicator | **GSAP** | `useScrollAnimation.js` → ScrollTrigger tied to rail scroll | Desktop only, reduced-motion disabled |
| Smooth scroll (wheel/trackpad) | **Lenis** | `useLenis.js` → `lenis.raf(time)` in rAF loop | Desktop pointer-fine only, ≥1024px |

---

## Lenis Configuration

```javascript
// useLenis.js
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  touchMultiplier: 2,
  // Only initialized when:
  // - reducedMotion === false
  // - window.matchMedia('(pointer: fine)').matches === true
  // - window.innerWidth >= 1024
})
```

### Synchronization

- `requestAnimationFrame` drives `lenis.raf(time)` (milliseconds)
- GSAP ticker does NOT drive Lenis; Lenis runs independent RAF
- `lenis.on('scroll', ScrollTrigger.update)` keeps ScrollTrigger in sync
- No `gsap.ticker.lagSmoothing()` modification

### Enable Rules

| Condition | Lenis Active? |
|-----------|---------------|
| `prefers-reduced-motion: reduce` | ❌ Never |
| `pointer: coarse` (touch) | ❌ Never |
| `width < 1024px` | ❌ Never |
| Desktop, pointer: fine, reduced-motion: false | ✅ Yes |

### Cleanup (on unmount or rule change)

```javascript
lenis.off('scroll', ScrollTrigger.update)
lenis.destroy()
// RAF loop cancelled via cleanup flag
```

---

## GSAP Use Cases (Minimal)

GSAP is retained ONLY for:

1. **Sidebar parallax** (desktop, reduced-motion: false)
   - Trigger: page scroll
   - Target: `.sidebar` (or inner wrapper)
   - Effect: `yPercent: -10` (subtle upward drift)
   - Scrub: 0.5 (lag behind scroll)

2. **Project rail progress** (desktop, reduced-motion: false)
   - Trigger: horizontal scroll of `.projects-scroll`
   - Effect: Update progress bar / indicator width
   - Scrub: true (locked to scroll position)

### GSAP Context Management

```javascript
// useScrollAnimation.js
useEffect(() => {
  if (reducedMotion) return
  if (window.innerWidth < 1024) return
  if (!window.matchMedia('(pointer: fine)').matches) return

  const ctx = gsap.context(() => {
    // Sidebar parallax
    gsap.to('.sidebar', {
      yPercent: -10,
      ease: 'none',
      scrollTrigger: {
        trigger: '.main-content',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
      }
    })

    // Project rail progress
    ScrollTrigger.create({
      trigger: '.projects-scroll',
      start: 'left left',
      end: 'right right',
      onUpdate: (self) => {
        // Update progress indicator
      }
    })
  }, containerRef)

  return () => ctx.revert()
}, [reducedMotion])
```

- Every GSAP animation/scrollTrigger wrapped in `gsap.context()`
- `ctx.revert()` on cleanup kills all child ScrollTriggers and animations
- No orphaned triggers after resize, StrictMode, or HMR

---

## Reduced Motion Behavior

### Control Flow

```
useReducedMotion() → true
    ├── Motion components: initial='visible', transition.duration=0.01
    ├── useLenis(): early return, no instance created
    ├── useScrollAnimation(): early return, no ctx created
    └── CSS @media (prefers-reduced-motion: reduce):
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
          html { scroll-behavior: auto !important; }
          .content-section { opacity: 1 !important; transform: none !important; }
```

### What Still Works (Essential)

- Focus outlines (`:focus-visible`)
- Active nav state (color change, no animation)
- Hover contrast changes (instant)
- Layout stability
- All content immediately readable

---

## Scroll-to-Section Behavior

### Navigation Pill (`FloatingNav.jsx`)

```javascript
const scrollToSection = (id) => {
  const el = document.getElementById(id)
  if (!el) return
  
  if (lenisRef.current) {
    lenisRef.current.scrollTo(el, { offset: -80 }) // offset for floating nav
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  
  // Announce for a11y
  announceSection(id)
}
```

- Lenis `scrollTo()` used when Lenis is active
- Native `scrollIntoView({ behavior: 'smooth' })` when not
- Offset accounts for floating nav height (80px)
- Hash change triggers live region announcement

### IntersectionObserver (Active Section Detection)

```javascript
// App.jsx
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActiveSection(entry.target.id)
    })
  },
  { threshold: 0.4, rootMargin: '0px 0px -60% 0px' }
)
```

- Detects active section for nav pill highlight
- Does NOT trigger announcements (passive detection only)
- Announcements only on deliberate user navigation

---

## Architecture Summary

```
User Interaction
      │
      ▼
┌─────────────────────────────────────┐
│  Lenis (smooth scroll)              │ ← Desktop pointer-fine only
│  - Wheel/trackpad → smooth momentum │
│  - lenis.raf() in independent RAF   │
│  - lenis.on('scroll') → ScrollTrigger.update()
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  Motion (React)                     │
│  - Section reveals (whileInView)    │
│  - Sidebar stagger (variants)       │
│  - All hover/tap/focus micro-interactions │
│  - Layout animations (layoutId)     │
│  - Respects reducedMotion hook      │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  GSAP + ScrollTrigger (minimal)     │
│  - Sidebar parallax (scrub)         │
│  - Project rail progress (scrub)    │
│  - Wrapped in gsap.context()        │
│  - Disabled when reducedMotion=true │
│  - Disabled on mobile/tablet        │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  CSS Fallback                       │
│  - @media (prefers-reduced-motion)  │
│  - Instant transitions, no transform│
│  - scroll-behavior: auto            │
└─────────────────────────────────────┘
```

**Single responsibility per system. No duplicate ownership. Unified reduced-motion gate.**