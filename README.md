# Nitish R.G. — Portfolio

A complete professional profile suite built with React 19, Vite 8, Motion, GSAP, and Lenis. Features a polished public portfolio, admin content editor, and privacy-first analytics.

## Live Site

**Public:** https://nitish-r-g.github.io/Portfolio/
**Admin:** https://nitish-r-g.github.io/Portfolio/admin

## Tech Stack

- **React 19** — UI framework
- **Vite 8** — Build tool (multi-page: index.html + admin.html)
- **Motion** — Animations (Framer Motion successor)
- **GSAP + ScrollTrigger** — Scroll-based animations
- **Lenis** — Smooth scrolling (desktop only)
- **Lucide React** — Icons

## Features

### Public Portfolio
- Responsive sidebar layout (macOS-style dock)
- Case study cards with expand/collapse detail views
- Project carousel with horizontal scroll
- Certificate gallery with lightbox
- Availability/status badges
- Resume/CV variant downloads
- Privacy-first analytics (no cookies, no PII)
- `prefers-reduced-motion` support
- Skip-to-content link
- JSON-LD structured data
- Open Graph + Twitter Card metadata

### Admin Editor (`/admin`)
- Grouped sidebar navigation (Core, Research & Community, Founder & Creative, Advanced)
- Rich field editors: MetricsEditor, TagsEditor, LinksEditor, FieldGroup
- EnhancedListEditor for case-study sections
- Image upload with Canvas optimization
- localStorage draft saving
- JSON export to `portfolio.js`
- Mobile responsive with hamburger menu

## Folder Structure

```
├── index.html              # Public entry (full metadata stack)
├── admin.html              # Admin entry (noindex, nofollow)
├── vite.config.js          # Multi-page build, base: /Portfolio/
├── package.json
├── src/
│   ├── main.jsx            # React entry
│   ├── App.jsx             # Main app (UserCursor, skip link, grid shell)
│   ├── lib/
│   │   └── analytics.js    # Privacy-first analytics helper
│   ├── components/
│   │   ├── Sidebar.jsx     # Profile, skills, social
│   │   ├── MainContent.jsx # Data-driven section rendering
│   │   ├── Dock.jsx        # macOS-style magnification dock
│   │   ├── CaseStudyCard.jsx  # Expandable case study cards
│   │   ├── ProjectCarousel.jsx # Horizontal scroll carousel
│   │   ├── CertGallery.jsx    # Certificate grid + lightbox
│   │   ├── UserCursor.jsx     # Custom arrow cursor
│   │   ├── Button.jsx         # Reusable button variants
│   │   └── Icon.jsx           # Lucide icon mapping
│   ├── admin/
│   │   ├── main.jsx        # Admin entry
│   │   └── AdminEditor.jsx # Full admin editor
│   ├── data/
│   │   └── portfolio.js    # Central data file (all sections)
│   ├── hooks/
│   │   ├── usePortfolio.js    # Data access + localStorage draft
│   │   ├── useReducedMotion.js
│   │   └── useLenis.js        # Smooth scroll (desktop only)
│   └── styles/
│       └── global.css      # All styles
├── public/
│   ├── robots.txt          # Allow public, disallow /admin
│   ├── sitemap.xml         # Single-page sitemap
│   ├── og-image.svg        # 1200x630 preview image
│   └── assets/
│       ├── profile.svg
│       └── favicon.svg
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages auto-deploy
├── .env.example            # Analytics endpoint config
├── docs/                   # Task docs, verification checklists
└── build-log.md            # Sprint-by-sprint history
```

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/Portfolio/`

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_ANALYTICS_ENDPOINT` | Remote analytics POST endpoint | (none — console only) |

See `.env.example` for details.

## Build

```bash
npm run build
```

Output in `dist/`. Current baselines:

| Chunk | Size | Gzipped |
|-------|------|---------|
| Shared (React/Motion/GSAP) | 217 KB | 69 KB |
| Main entry | 297 KB | 104 KB |
| Admin entry | 41 KB | 10 KB |
| CSS | 42 KB | 7 KB |

## Deployment

### GitHub Pages (Automated)
Push to `main` triggers auto-deploy via GitHub Actions.

### Manual
```bash
npm run build
# Upload dist/ to any static host
```

## Accessibility
- Keyboard navigation support
- Focus outlines on all interactive elements
- ARIA labels on icon-only buttons
- Semantic heading hierarchy
- `prefers-reduced-motion` support
- Skip-to-content link

## License
MIT
