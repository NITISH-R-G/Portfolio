# Nitish R.G. — Student Developer & Data Science Enthusiast Portfolio

A clean, responsive, single-page portfolio inspired by the Resumx Framer template. Built with React 19, Vite 8, Motion, GSAP, and Lenis.

## Tech Stack

- **React 19** — UI framework
- **Vite 8** — Build tool
- **Motion** — Animations (Framer Motion successor)
- **GSAP + ScrollTrigger** — Scroll-based animations
- **Lenis** — Smooth scrolling
- **Lucide React** — Icons

## Folder Structure

```
.
├── index.html              # Vite entry point
├── vite.config.js          # Vite config with base path
├── package.json            # Dependencies
├── src/
│   ├── main.jsx            # React entry
│   ├── App.jsx             # Main app component
│   ├── components/
│   │   ├── Icon.jsx        # Lucide icon mapping
│   │   ├── Sidebar.jsx     # Profile, about, skills, languages, social
│   │   ├── FloatingNav.jsx # Bottom navigation
│   │   ├── Section.jsx     # Reusable section wrapper
│   │   ├── ProjectCard.jsx # Project cards
│   │   └── MainContent.jsx # Main scrollable area
│   ├── data/
│   │   ├── portfolio.js    # Central data file
│   │   └── README.md       # Editing instructions
│   ├── hooks/
│   │   ├── usePortfolio.js    # Portfolio data access
│   │   ├── useReducedMotion.js # Reduced motion detection
│   │   ├── useLenis.js        # Smooth scrolling
│   │   └── useScrollAnimation.js # GSAP scroll animations
│   └── styles/
│       └── global.css      # All styles
├── public/
│   └── assets/
│       ├── profile.svg     # Profile avatar (NR initials)
│       └── favicon.svg     # Favicon (N initial)
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages deployment
├── docs/
│   ├── reference-audit.md  # Design system audit
│   └── migration-plan.md   # Migration plan
└── build-log.md            # Sprint-by-sprint build history
```

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/Portfolio/`

## Build

```bash
npm run build
```

Output in `dist/` directory.

## Customization

### Content
Edit `src/data/portfolio.js` to update:
- Profile info (name, role, image, bio)
- Skills and languages
- Projects
- Social links
- Navigation items
- Contact information
- Theme colors

### Colors (CSS Variables)
All colors are defined in `src/styles/global.css`:
```css
:root {
  --background: #0D0D0D;
  --surface: #1A1A1A;
  --foreground: #FFFFFF;
  --muted: #9A9A9A;
  --accent: #8B5CF6;
  --border: #2A2A2A;
  --radius: 12px;
  --font: 'Inter', sans-serif;
}
```

## Deployment

### GitHub Pages (Automated)
The repository includes a GitHub Actions workflow that automatically deploys to GitHub Pages on push to `main`.

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

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License
MIT — Free to use, modify, and deploy.

---

Built with React + Vite. Inspired by [Resumx](https://www.framer.com/community/marketplace/templates/resumx/).