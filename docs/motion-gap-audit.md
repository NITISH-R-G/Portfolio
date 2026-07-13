# Motion & Visual Audit Report

**Date:** 2026-07-13
**Portfolio:** Nitish R.G. — React 19 + Vite 8 + Motion + GSAP + Lenis
**Reference:** https://resumx.framer.website/

---

## Screenshots Taken

| Viewport | File | Status |
|----------|------|--------|
| 1440x900 (desktop) | `C:\Users\nitis\AppData\Local\Temp\portfolio-1440.png` | Captured |
| 1280x800 (laptop) | `C:\Users\nitis\AppData\Local\Temp\portfolio-1280.png` | Captured |
| 768x1024 (tablet) | `C:\Users\nitis\AppData\Local\Temp\portfolio-768.png` | Captured |
| 430x932 (mobile) | `C:\Users\nitis\AppData\Local\Temp\portfolio-430.png` | Captured |
| 375x812 (mobile) | `C:\Users\nitis\AppData\Local\Temp\portfolio-375.png` | Captured |

---

## Visual Observations (from screenshots + code inspection)

### Desktop (1440x900, 1280x800)
- Two-column grid: 320px sticky sidebar + scrollable main content
- Sidebar animates in with staggered fade-up children (Motion variants)
- Main content sections use `whileInView` fade-up AND GSAP ScrollTrigger — **dual animation on same elements**
- Floating nav pill centered at bottom overlays the Experience section text
- Project cards are horizontally scrollable with no scroll indicator (no arrows, no fade edges, no shadow)
- Skill tags have border-only styling; on hover they scale + border color change (via Motion `whileHover`)
- Social icons (GitHub only visible) at bottom of sidebar

### Tablet (768x1024)
- Sidebar moves to top, full width; single-column layout
- Skills tags wrap aggressively across full width
- Project cards still horizontal scroll but only partially visible — no affordance indicating scrollability
- About text appears to overflow slightly

### Mobile (430x932, 375x812)
- Sidebar stacks on top as full-width header
- About text **truncates at viewport edge** — no horizontal padding fix for overflow
- Intro text paragraphs also overflow right edge
- Skills tags wrap but some are clipped at right edge (e.g., "Data Cleaning", "Algorithms" cut off)
- Project cards barely visible — only tops of gradient backgrounds shown
- Floating nav pill overlaps intro content text
- Languages dots not visible on narrowest (375px)

---

## Reference Site Observations (resumx.framer.website)

- Framer-powered site with polished micro-interactions
- Smooth scroll-triggered section reveals with staggered child elements
- Card hover effects with image zoom/overlay transitions
- Navigation uses animated active indicator (sliding pill/highlight)
- Consistent spacing and padding at all viewports — no overflow
- Professional typography hierarchy with clear visual weight
- Subtle parallax on scroll for depth
- Cursor-aware interactions on interactive elements
- Loading/entrance sequence coordinated across all elements

---

## Gap Analysis Table

| Surface | Current Behaviour | Reference Quality Observed | Gap | Proposed Fix | Priority |
|---------|-------------------|----------------------------|-----|--------------|----------|
| Initial load | Sidebar children stagger in (0.08s gaps). Main content appears instantly with no coordinated entrance — sections just exist. No page-level loading sequence. | Coordinated entrance: elements fade/slide in a choreographed sequence. Sidebar and main content animate together with a unified timing curve. | No unified page entrance animation. Main content appears abruptly while sidebar animates alone. Feels disjointed on first load. | Add a coordinated page-level entrance: animate sidebar and main content sections with staggered delays using a shared Motion timeline. Sequence: sidebar slide-in → main content fade-up cascade. | P1 |
| Scroll feel | Lenis smooth scroll (duration 1.2s, exponential easing). GSAP ScrollTrigger animates `.content-section` opacity/y on scroll. Motion `whileInView` ALSO animates the same elements. Dual systems fight each other. | Single smooth scroll system with unified section reveal. No conflicting animation drivers. | **Dual animation conflict**: both `useScrollAnimation.js` (GSAP) and `Section.jsx` (Motion `whileInView`) target the same `.content-section` elements. Sections animate twice — once from GSAP `fromTo` and once from Motion variants. Causes jittery/flickering section entrances. | Remove GSAP ScrollTrigger from `useScrollAnimation.js` and rely solely on Motion's `whileInView` for section reveals (or vice versa). Pick one animation system per element. | P0 |
| Sidebar | Staggered fade-up entrance via Motion container/item variants. Sticky positioning works. Profile photo has spring hover scale. Social icons have scale + border hover. | Sidebar elements have individual staggered reveals with subtle slide direction (some from left, some from up). Hover states include color transitions, not just scale. | Sidebar entrance is functional but flat — all items use identical `y: 20` slide-up. No directional variety. Social icon hover only scales, no color/glow feedback beyond border change. | Add directional variety to sidebar item entrances (e.g., profile slides from left, skills tags stagger individually with scale). Add subtle glow or background shift on social icon hover. | P2 |
| Nav pill | Fixed bottom-center pill with 6 icon buttons. Active state uses CSS `.active` class adding `rgba(255,255,255,0.15)` background. Transition is `all 0.2s`. No animated indicator between icons. | Animated sliding pill/underline that smoothly transitions between active nav items. Active indicator has spring physics. | Active state is a static background color swap with no animated transition between items. No sliding indicator. When scrolling, the active icon "jumps" rather than glides. | Replace CSS-only active state with a Motion `layoutId` animated indicator that slides between nav items. Use spring transition for the indicator movement. | P1 |
| Icons | Lucide React icons for nav items. Custom SVG for social (GitHub, LinkedIn, Twitter, YouTube). Static rendering with no entrance animation. | Icons have subtle entrance animations (fade + scale). Interactive icons respond to hover with color shift and micro-scale. | Nav icons have no staggered entrance — they appear all at once when the pill renders. Social icons have hover scale but nav icons only get background color on active/hover. | Add staggered entrance animation for nav pill icons. Add subtle rotation or bounce micro-interaction on nav icon tap/click. | P2 |
| Project cards | `whileHover: y: -4` lift. `whileTap: scale: 0.98`. Horizontal scroll container with `overflow-x: auto`. No scroll indicators, no drag support, no peek preview. Cards have gradient backgrounds + emoji logos. | Cards have hover image zoom, overlay text reveal, or border glow. Horizontal scroll has drag-to-scroll, peek previews, and scroll position indicators. | Cards feel static — only a 4px lift on hover. No visual richness on interaction. Horizontal scroll has no affordance (no arrows, no shadow fade, no drag). Users may not realize cards are scrollable. | Add image scale-on-hover effect within card. Add scroll shadows or gradient fades at edges to indicate scrollability. Consider drag-to-scroll via Motion `drag="x"`. Add card entrance stagger when projects section enters viewport. | P1 |
| Buttons | Single button type: "View details →" link styled as inline text in accent color. No hover state beyond browser default. Social icons and nav icons are button-like but not `<button>` elements. | Buttons have fill/outline transitions, hover glow, press scale, and loading states. CTA buttons have prominent visual weight. | No dedicated button component with proper hover/active states. "View details" is a plain text link with no visual feedback on hover. No CTA prominence for key actions. | Create a reusable Button component with hover fill transition, subtle glow, and press scale. Apply to "View details" and any future CTAs. | P2 |
| Cursor | Default system cursor throughout. No custom cursor, no magnetic effects, no pointer changes on interactive elements beyond browser defaults. | Custom cursor dot/ring that scales on hover over interactive elements. Magnetic pull on buttons. Cursor changes on draggable elements. | No cursor personalization. Interactive elements rely entirely on browser cursor changes. Feels generic compared to polished reference. | Add a custom cursor component (small dot + ring) using Motion that scales on interactive element hover. Add magnetic pull effect on nav pill and social icons. | P2 |
| Mobile transitions | Responsive breakpoints at 1024px (tablet) and 768px (mobile). Sidebar collapses to top. No animated transitions between breakpoints — layout snaps. Project cards remain horizontal scroll. | Smooth layout transitions between viewports. Elements reflow with animation. Mobile has touch-optimized gestures (swipe between sections). | Layout changes are abrupt CSS snaps with no transition animation. On resize, content jumps. Mobile has no gesture support for project cards (swipe navigation). | Add layout animation via Motion `layout` prop on sidebar/main wrapper to animate between desktop and mobile layouts. Add swipe gesture support for project card carousel on mobile. | P1 |
| Accessibility | `useReducedMotion` hook respects `prefers-reduced-motion`. All motion variants check `reducedMotion` flag. Focus-visible outlines defined in CSS. `aria-label` on nav. | WCAG 2.1 AA compliant with skip links, proper heading hierarchy, screen reader announcements for dynamic content. | No skip-to-content link. Section transitions have no `aria-live` announcements. Reduced motion works but sections still animate GSAP independently. Focus management on section navigation is absent. | Add skip-to-main-content link. Add `aria-live="polite"` region for section change announcements. Ensure GSAP animations also respect reduced motion flag (currently only Motion does). | P0 |
| Mobile transitions (overflow) | On 375px and 430px viewports, about text, intro text, and some skill tags overflow the viewport edge. Text is clipped at right boundary. No horizontal scroll or ellipsis. | All text content fits within viewport bounds at all breakpoints. Proper padding and max-width prevent overflow. | **Content overflow on mobile**: about text, intro paragraphs, and skill tags extend past the right viewport edge. This is a layout bug, not just a motion issue — content is unreadable. | Add `overflow: hidden` or `word-break: break-word` on text containers. Adjust padding for mobile breakpoints. Ensure skill tags container has `flex-wrap: wrap` with proper max-width. | P0 |

---

## Summary of Findings

### Total Issues Identified: 12

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 3 | Blocking issues that break UX or accessibility |
| P1 | 4 | Significant polish gaps vs. reference quality |
| P2 | 5 | Nice-to-have enhancements for premium feel |

### Top 3 P0 Findings

1. **Dual animation system conflict** (`useScrollAnimation.js` + `Section.jsx`): Both GSAP ScrollTrigger and Motion `whileInView` animate the same `.content-section` elements simultaneously. Sections animate twice per scroll, causing visible flicker/jitter on section entry. Must remove one system.

2. **Mobile content overflow**: At 375px and 430px viewports, about text, intro paragraphs, and some skill tags overflow past the right edge of the viewport. Content is clipped and unreadable. This is a CSS layout bug requiring padding/overflow fixes.

3. **Accessibility gaps**: No skip-to-content link. GSAP animations do not check `reducedMotion` flag (only Motion does). No `aria-live` announcements for section changes during scroll navigation. Users relying on assistive tech cannot effectively navigate the page.

---

*Report generated from code inspection and screenshot analysis. No code changes were made.*
