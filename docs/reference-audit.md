# Reference Audit — Nitish R.G. Portfolio

> Audit of the static HTML/CSS/JS portfolio for React + Vite migration planning.
> Source repo: https://github.com/NITISH-R-G/Portfolio

---

## Current Design System

### Layout

- **Page grid:** `grid-template-columns: 320px 1fr` (CSS Grid on `.page-wrapper`)
- **Sidebar width:** 320px, sticky, full viewport height (`position: sticky; top: 0; height: 100vh`)
- **Sidebar padding:** 40px top/bottom, 30px left/right
- **Sidebar border:** `1px solid #2a2a2a` right edge
- **Main content max-width:** 860px
- **Main content padding:** 40px 60px (desktop), 120px bottom padding for scroll clearance
- **Breakpoints:**
  - Tablet: `max-width: 1024px` — sidebar unsticky, single column
  - Mobile: `max-width: 768px` — sidebar stacks above, reduced padding
  - Small mobile: `max-width: 480px` — further padding reduction

### Typography

- **Font:** Inter (Google Fonts), weights 400/500/600/700
- **Base size:** 14px on `<body>`
- **Line height:** 1.6 (body), 1.7–1.8 (text blocks)
- **Heading hierarchy:**
  - h1 (profile name): 24px, weight 600
  - h2 (section titles): 16px
  - h3 (card titles): 15px, weight 600
  - Section labels: 11px, weight 600, letter-spacing 1.5px, uppercase, muted color
- **Text colors:**
  - Primary (`.accent`): `#FFFFFF`
  - Secondary/Muted (`.muted`): `#9A9A9A` (WCAG AA 6.3:1 contrast on `#0D0D0D`)
- **Anti-aliasing:** `-webkit-font-smoothing: antialiased`

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0D0D0D` | Page background |
| `--surface` | `#1A1A1A` | Card backgrounds, hover states |
| `--accent` | `#FFFFFF` | Primary text |
| `--muted` | `#9A9A9A` | Secondary text, labels |
| `--radius` | `12px` | Border radius for cards, tables |
| Border default | `#2a2a2a` | All borders (cards, sidebar, nav, table rows) |
| Border hover | `#555555` | Interactive border hover state |
| Link blue | `#3b82f6` | Project links, focus outlines, verified badge |
| Link blue hover | `#60a5fa` | Project link hover |

### Surface / Card System

- **Cards (project, experience, education, certification, testimonial):**
  - Background: `var(--surface)` (#1A1A1A)
  - Border: `1px solid #2a2a2a`
  - Border radius: 12px
  - Padding: 20px (experience/education), 16px (project info), 24px (testimonial)
- **Project cards:**
  - Min width: 320px (horizontal scroll on desktop, stacked on mobile)
  - Image height: 180px desktop, 160px mobile, 140px small mobile
  - Logo overlay: 40px circle, bottom-left positioned at -16px offset
- **Contact table:**
  - Bordered container with `border-radius: 12px`
  - Rows separated by `1px solid #2a2a2a` bottom border
  - Row padding: 16px 20px

### Nav Pill (Floating Navigation)

- **Position:** Fixed bottom center (`bottom: 40px, left: 50%, transform: translateX(-50%)`)
- **Style:** Glassmorphism pill — `background: rgba(30, 30, 30, 0.95)`, `backdrop-filter: blur(10px)`, border radius 40px
- **Border:** `1px solid #2a2a2a`
- **Items:** 7 circular icons, 40px × 40px each, gap 8px, padding 12px 20px
- **Active state:** `background: rgba(255, 255, 255, 0.15)`, `color: #ffffff`, `transform: scale(1.1)` (injected via JS)
- **Hover state:** `background: rgba(255, 255, 255, 0.1)`
- **Mobile adjustments:**
  - 768px: bottom 20px, padding 10px 16px, border-radius 30px, max-width 90vw
  - 480px: bottom 16px, padding 8px 12px, gap 4px

### Project Card Composition

Each card follows this structure:
```
.project-card
├── .project-image-wrapper (relative, 180px height)
│   ├── .project-image (gradient background, full area)
│   └── .project-logo (absolute, bottom-left, 40px circle with emoji)
└── .project-info (16px padding)
    ├── .project-title (15px, weight 600)
    ├── .project-description (13px, muted, line-height 1.6)
    ├── .project-meta (flex wrap, 12px, muted, gap 12px)
    └── .project-link (13px, blue, weight 500)
```

- **Image gradients:**
  - Card 1: `linear-gradient(135deg, #ff9a56 0%, #ff6b6b 100%)`
  - Card 2: `linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)`
  - Card 3: `linear-gradient(135deg, #34d399 0%, #059669 100%)`
- **Hover:** `translateY(-2px)`, border-color `#555555`
- **Scroll behavior:** `scroll-snap-type: x mandatory` on container, `scroll-snap-align: start` on cards

### Mobile Header and Nav Behavior

- **No mobile hamburger menu.** Sidebar becomes a full vertical column stacked above main content at ≤1024px.
- **Sidebar on mobile:** `position: relative`, `height: auto`, loses sticky behavior, gains bottom border
- **Profile on mobile:** Stays block layout (80px photo above name, even at 480px it drops to 72px)
- **Floating nav on mobile:** Remains fixed bottom center, scales down proportionally
- **Touch targets:** Enforced minimum 44×44px on all interactive elements at 768px and below
- **Projects on mobile:** Switch from horizontal scroll to vertical stack (`flex-direction: column`)
- **Experience/Education on mobile:** Icon stacks above content (column direction)

### Accessibility

- Skip-to-content link (visible on Tab focus)
- `focus-visible` outlines: `2px solid #3b82f6` with `2px offset` on all interactive elements
- ARIA labels on all icon-only nav links and social links
- Semantic HTML: `<aside>`, `<main>`, `<nav>`, `<section>`, `<footer>`
- Heading hierarchy: h1 → h2 → h3 (logical)
- Color contrast: 6.3:1 for muted text (WCAG AA pass)

---

## Current Motion & Interaction

### Smooth Scroll
- CSS `scroll-behavior: smooth` on `<html>`
- JS `scrollIntoView({ behavior: 'smooth', block: 'start' })` on nav click

### Intersection Observer
- Section detection via IntersectionObserver (`rootMargin: '0px 0px -60% 0px'`, `threshold: 0.4`)
- Fallback: debounced scroll handler using `requestAnimationFrame`

### Hover Effects
- **Skill tags:** Border color → `#555555`, text → `#ffffff`, transition 0.2s
- **Social icons:** Border → `#555555`, color → `#ffffff`, transition 0.2s
- **Contact items:** Color → `#ffffff`, transition 0.2s
- **Project cards:** `translateY(-2px)`, border → `#555555`, transition 0.2s
- **Contact rows:** Background → `var(--surface)`, transition 0.2s
- **Nav icons:** Background → `rgba(255,255,255,0.1)`, transition 0.2s
- **Footer links:** Color → `#ffffff`, transition 0.2s

### Active State
- Nav icons gain `scale(1.1)`, white background, and white text when active section is detected

### What's Missing (Enhancement Opportunities)
- No scroll-triggered entrance animations
- No page-load animations
- No parallax or depth effects
- No smooth page transitions
- No gesture-based interactions (drag, swipe on mobile)
- No reduced-motion media query support
- CSS transitions only — no spring physics or easing variety

---

## Migration Notes

### What Works Well to Keep
- **Color system:** The 5-token CSS variable palette is clean and maintainable. Port directly to CSS custom properties or Tailwind theme.
- **Card composition pattern:** Consistent structure across project, experience, education, certification cards. Ideal for React component reuse.
- **Responsive breakpoint strategy:** 1024/768/480 breakpoints are well-chosen. Keep the same breakpoints.
- **Accessibility foundation:** Skip link, focus-visible, ARIA labels, semantic HTML — all good patterns to preserve.
- **Dark theme:** No light mode planned, so dark theme can be baked in.
- **Project card layout:** Horizontal scroll on desktop, stacked on mobile — elegant pattern to preserve.

### What Needs Improvement
- **No component architecture:** All HTML is monolithic. React will enable proper component decomposition.
- **No data layer:** Content is hardcoded in HTML. Moving to a JS data file enables easy updates.
- **Limited motion:** Only CSS transitions. GSAP + Motion will add scroll-triggered reveals, spring physics, and stagger effects.
- **No smooth scroll library:** Native `scroll-behavior: smooth` is jittery. Lenis will replace it.
- **SVG icons inline:** 6 social icons + 7 nav icons as raw SVG. Lucide React will standardize these.
- **No reduced-motion support:** `prefers-reduced-motion` media query is absent.
- **Footer content is template branding:** "Built using Framer", "Buy this template" — needs replacement.
- **Testimonials section is hidden:** `display: none` — either remove or populate.

### Component Decomposition Plan
| Current HTML Block | React Component | Notes |
|--------------------|-----------------|-------|
| `.sidebar` | `<Sidebar>` | Profile, About, Contact, Skills, Languages, Social |
| `.floating-nav` | `<FloatingNav>` | Fixed pill, active state via IntersectionObserver hook |
| `.project-card` | `<ProjectCard>` | Reusable, accepts data props |
| `.experience-card` | `<ExperienceCard>` | Reusable |
| `.education-card` | `<EducationCard>` | Reusable |
| `.certification-card` | `<CertificationCard>` | Reusable |
| `.contact-table` | `<ContactTable>` | Reusable |
| Each `.content-section` | `<Section>` | Wrapper with reveal animation |
| Inline SVG icons | Lucide React | Replace all 13+ inline SVGs |
| `js/main.js` intersection logic | `useActiveSection` hook | Custom hook |
| `scroll-behavior: smooth` | Lenis | Smooth scroll library |
