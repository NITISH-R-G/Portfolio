# Final Polish QA Report

**Date:** 2026-07-13
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion
**Task:** 21 — Final QA & Release Gate

---

## Test Matrix

| Test | Environment / Viewport | Result | Evidence | Issue Priority | Fix / Notes |
|------|-------------------------|--------|----------|----------------|-------------|
| Load & Layout | Chrome 1440x900 | PASS | scrollWidth===innerWidth, no overflow | — | — |
| Load & Layout | Chrome 1280x800 | PASS | scrollWidth===innerWidth, no overflow | — | — |
| Load & Layout | Chrome 768x1024 | PASS | scrollWidth===innerWidth, no overflow | — | — |
| Load & Layout | Chrome 430x932 | PASS | scrollWidth===innerWidth, nav centered | P0 FIXED | Nav overflow fixed with x: "-50%" |
| Load & Layout | Chrome 375x812 | PASS | scrollWidth===innerWidth, cards vertical | P0 FIXED | Vertical stack on mobile |
| Resize Continuous | 1440→375→1440 | PASS | Layout updates correctly, no duplicate listeners | — | — |
| Scroll 30s | Chrome desktop | PASS | No flicker, no reset, no scroll-jacking | — | — |
| Scroll Rapid | Top/bottom multiple | PASS | Sections reveal once, no jitter | — | — |
| Cursor Desktop | 1440x900 | PASS | 6px dot + 28px ring, RAF-driven | — | — |
| Cursor Mobile | 430x932 | PASS | No cursor elements rendered | — | — |
| Cursor Reduced Motion | prefers-reduced-motion | PASS | No cursor elements rendered | — | — |
| Cursor 4x CPU | Chrome throttle | PASS | Minor lag expected, no stuttering | — | — |
| Nav Click All 6 | Desktop | PASS | All sections reached, hashes update | — | — |
| Nav Rapid Click | Desktop | PASS | Single indicator, no duplication | — | — |
| Hash Direct URL | /#about, /#projects, /#contact | PASS | Correct sections reached | — | — |
| Hash GitHub Pages | /Portfolio/#about | PASS | Deep links work under base path | — | — |
| Aria-live | Desktop | PASS | One message per deliberate navigation | — | — |
| Keyboard Skip | Chrome desktop | PASS | Skip link first, target #main-content | P0 FIXED | Added tabIndex="-1" to main |
| Keyboard Tab All | Chrome desktop | PASS | Logical order, no hidden focus | — | — |
| Keyboard Nav Pill | Chrome desktop | PASS | Focus-visible, can navigate | — | — |
| Keyboard Project Links | Chrome desktop | PASS | All reachable via Tab | — | — |
| Reduced Motion | prefers-reduced-motion | PASS | No Lenis, no cursor, no GSAP, instant reveal | — | — |
| Project Rail Desktop | 1440x900 | PASS | Horizontal scroll, snap proximity | — | — |
| Project Rail Mobile | 430x932 | PASS | Vertical stack, full-width cards | — | — |
| Favicon | Production build | PASS | Loads correctly | — | — |
| Profile SVG | Production build | PASS | Loads correctly | P0 FIXED | Path updated to /Portfolio/assets/ |
| All Assets | Production build | PASS | Zero 404 responses | — | — |
| Console Errors | Production build | PASS | Zero errors, zero warnings | — | — |
| Console Warnings | Production build | PASS | React focusVisible warning eliminated | P1 FIXED | Removed invalid prop |
| Lighthouse | Not available | — | Manual testing performed | — | — |
| Deployment Workflow | deploy.yml | PASS | Builds with npm ci + npm run build | — | — |

---

## Production Build Output

| Asset | Raw | Gzipped | Budget | Status |
|-------|-----|---------|--------|--------|
| JS | 475.50 KB | 159.19 KB | < 180 KB | PASS |
| CSS | 12.92 KB | 2.93 KB | < 10 KB | PASS |
| **Total** | 488.42 KB | **162.12 KB** | < 200 KB | PASS |

---

## Fixes Applied During Task 21

| Priority | Issue | Fix | File |
|----------|-------|-----|------|
| P0 | Nav overflow on mobile (430px/375px) | Added `x: "-50%"` to Motion initial/animate for centering | `src/components/FloatingNav.jsx` |
| P0 | Skip link target broken | Added `tabIndex="-1"` to `#main-content` element | `src/components/MainContent.jsx` |
| P0 | Missing section IDs for navigation | Added `id="about"`, `id="skills"` to sidebar sections | `src/components/Sidebar.jsx` |
| P0 | Profile image 404 on GitHub Pages | Updated path to `/Portfolio/assets/profile.svg` | `src/data/portfolio.js` |
| P0 | Incomplete aria-live announce labels | Added "about" and "skills" to labels map | `src/App.jsx` |
| P1 | Divs in tab order (ProjectCard) | Removed `whileTap` from non-interactive wrapper | `src/components/ProjectCard.jsx` |
| P1 | React prop warning (focusVisible) | Removed invalid `focusVisible` prop from Button | `src/components/Button.jsx` |

---

## Remaining P2 Limitations

| Item | Rationale |
|------|-----------|
| Sidebar entrance lacks directional variety | All items use same y:20 slide-up; would require per-item variant customization |
| No Lighthouse audit performed | Lighthouse CLI not available in test environment; manual testing performed instead |
| Cursor label may clip near viewport edges | Boundary checks mitigate but edge cases possible on very small desktop windows |
| Project rail snap may not be precise on slow scroll | proximity mode chosen for smoothness over precision |

---

## Quality Ratings

| Category | Rating | Justification |
|----------|--------|---------------|
| Visual Fidelity | 8.0/10 | Token-based dark theme, responsive at all viewports, proper hierarchy. Consistent spacing and typography. Minor: sidebar entrance lacks directional variety. |
| Motion Polish | 8.0/10 | Single animation owner per element, coordinated load sequence, micro-interactions with spring physics. Minor: no cursor on reduced-motion (expected behavior). |
| Accessibility | 8.5/10 | Skip link, aria-live, focus-visible, reduced-motion, semantic HTML, proper ARIA labels. All interactive elements keyboard-accessible. |
| Performance | 8.5/10 | 162.12KB gz under budget, no new dependencies, RAF-driven cursor, GSAP context cleanup. Minimal bundle growth across tasks. |

---

## Release Decision

**APPROVED** — All P0 and P1 issues resolved. All mandatory tests pass. Remaining P2 items documented with rationale. Ready for production deployment.