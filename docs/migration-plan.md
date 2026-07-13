# Migration Plan — Static HTML/CSS/JS to React + Vite

> Step-by-step plan to migrate the Nitish R.G. portfolio from vanilla web technologies
> to React + Vite + Motion + GSAP + Lenis + Lucide React.

---

## Overview

| Aspect | Current | Target |
|--------|---------|--------|
| Framework | None (vanilla HTML) | React 18+ |
| Build tool | None (static files) | Vite |
| Animations | CSS transitions only | Motion (Framer) + GSAP ScrollTrigger |
| Smooth scroll | CSS `scroll-behavior` | Lenis |
| Icons | 13+ inline SVGs | Lucide React |
| Data | Hardcoded in HTML | `src/data/portfolio.js` |
| Deployment | GitHub Pages (static) | GitHub Pages (Vite build) |

---

## Current Files Audit

### Retained (Move to `public/`)

| File | Size | Destination | Notes |
|------|------|-------------|-------|
| `assets/profile.svg` | 0.5 KB | `public/assets/profile.svg` | NR initials gradient SVG |
| `assets/favicon.svg` | 0.5 KB | `public/assets/favicon.svg` | N initial gradient SVG |

### Replaced by React Components

| File | Lines | Replacement | Notes |
|------|-------|-------------|-------|
| `index.html` | 289 | `src/App.jsx` + `index.html` (Vite entry) | Vite keeps a minimal `index.html` |
| `css/styles.css` | 772 | `src/styles/global.css` | Port CSS variables, keep as global CSS |
| `css/responsive.css` | 381 | `src/styles/responsive.css` | Keep breakpoints, minor cleanup |
| `js/main.js` | 153 | `src/hooks/useActiveSection.js` | IntersectionObserver → custom hook |

### Archived (Keep in `docs/`)

| File | Purpose |
|------|---------|
| `QA-report.md` | Initial QA sprint report |
| `visual-review.md` | Visual regression notes |
| `final-qa-report.md` | Final QA checklist (all pass) |
| `build-log.md` | Sprint-by-sprint build history |
| `docs/2026-07-13-resumx-recreation.md` | Original recreation plan |

### Updated

| File | Change |
|------|--------|
| `README.md` | Rewrite for React + Vite instructions |

### Not Deleted Yet

All original static files remain until React version is verified and deployed.

---

## New File Structure

```
Portfolio/
├── public/
│   └── assets/
│       ├── profile.svg          # Copied from current assets/
│       └── favicon.svg          # Copied from current assets/
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx          # Left sidebar (profile, about, contact, skills, languages, social)
│   │   ├── FloatingNav.jsx      # Fixed bottom pill navigation
│   │   ├── ProjectCard.jsx      # Reusable project card
│   │   ├── ExperienceCard.jsx   # Reusable experience card
│   │   ├── EducationCard.jsx    # Reusable education card
│   │   ├── CertificationCard.jsx # Reusable certification card
│   │   ├── ContactTable.jsx     # Contact links table
│   │   ├── Section.jsx          # Section wrapper with reveal animation
│   │   └── Footer.jsx           # Footer component
│   ├── data/
│   │   └── portfolio.js         # All content data (projects, skills, links, etc.)
│   ├── hooks/
│   │   ├── useActiveSection.js  # IntersectionObserver for nav active state
│   │   └── useReducedMotion.js  # prefers-reduced-motion detection
│   ├── styles/
│   │   ├── global.css           # CSS reset, variables, base styles (from styles.css)
│   │   └── responsive.css       # Media queries (from responsive.css)
│   ├── App.jsx                  # Root component (page layout)
│   └── main.jsx                 # React entry point (Lenis init, GSAP setup)
├── docs/
│   ├── reference-audit.md       # This audit document
│   ├── migration-plan.md        # This migration plan
│   ├── QA-report.md             # Archived
│   ├── visual-review.md         # Archived
│   ├── final-qa-report.md       # Archived
│   ├── build-log.md             # Archived
│   └── 2026-07-13-resumx-recreation.md
├── index.html                   # Vite entry (minimal, just #root)
├── vite.config.js               # Vite config with base path
├── package.json                 # Dependencies
├── README.md                    # Updated for React + Vite
└── [screenshot PNGs]            # Keep or remove as needed
```

---

## GitHub Pages Strategy

- **Base path:** `/Portfolio/`
- **Vite config:** `base: "/Portfolio/"`
- **Build output:** `dist/`
- **Deploy method:** GitHub Actions workflow (build + deploy to Pages)
- **Branch:** `main` for source, GitHub Actions builds and deploys `dist/`

### `vite.config.js`

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Portfolio/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
```

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "motion": "^12.0.0",
    "lucide-react": "^0.400.0",
    "lenis": "^1.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `motion` | Scroll-triggered reveals, spring animations, layout animations |
| `lucide-react` | Standardized SVG icons (replace 13+ inline SVGs) |
| `lenis` | Smooth scroll with inertia and raf-based loop |
| `gsap` + `@gsap/react` | **Optional** — only if ScrollTrigger features beyond Motion are needed |
| `vite` / `@vitejs/plugin-react` | Build tooling |

> **Note:** GSAP is listed as optional. Motion handles most scroll-trigger animations. Add GSAP only if timeline sequencing or ScrollTrigger-specific features are required.

---

## Migration Steps

### Phase 1: Scaffold (Steps 1–3)

#### Step 1: Initialize Vite + React

```bash
cd "C:\Users\nitis\OneDrive\Documents\Nitish Portfolio"
npm create vite@latest . -- --template react
npm install
npm install motion lucide-react lenis
```

This creates the Vite boilerplate. We'll replace the generated files.

#### Step 2: Configure Vite

Edit `vite.config.js` to set `base: '/Portfolio/'` for GitHub Pages subpath deployment.

#### Step 3: Move assets to `public/`

```bash
mkdir -p public/assets
cp assets/profile.svg public/assets/
cp assets/favicon.svg public/assets/
```

Assets in `public/` are served at root and don't go through the build pipeline.

---

### Phase 2: Data Layer (Step 4)

#### Step 4: Create portfolio data system

Create `src/data/portfolio.js` — a single source of truth for all content:

```js
export const profile = {
  name: "Nitish R.G.",
  initials: "NR",
  photo: "/assets/profile.svg",
  about: "IIT Madras student passionate about...",
  role: "Student Developer & Data Science Enthusiast",
}

export const contact = [
  { type: "email", value: "contact@example.com", href: "mailto:contact@example.com" },
  { type: "github", value: "github.com/nitish", href: "#" },
  { type: "linkedin", value: "linkedin.com/in/nitish", href: "#" },
]

export const skills = [
  "Python", "Java", "Pandas", "NumPy", "Scikit-learn",
  "Data Cleaning", "Exploratory Analysis", "Regression",
  "Model Evaluation", "Algorithms", "Linear Algebra",
  "Debugging", "Git/GitHub",
]

export const languages = [
  { name: "English", level: 5 },
  { name: "Hindi", level: 5 },
]

export const socialLinks = [
  { platform: "Twitter", url: "#", icon: "Twitter" },
  { platform: "LinkedIn", url: "#", icon: "Linkedin" },
  { platform: "GitHub", url: "#", icon: "Github" },
  // ...
]

export const projects = [
  {
    title: "House Price Prediction",
    description: "Data preparation and regression-based prediction model...",
    tags: ["Python", "Pandas", "Scikit-learn", "NumPy"],
    gradient: ["#ff9a56", "#ff6b6b"],
    emoji: "📊",
    emojiBg: "#22c55e",
  },
  // ...
]

export const experience = [
  {
    title: "Academic Projects",
    description: "Currently building academic and personal projects...",
  },
]

export const education = [
  {
    institution: "Indian Institute of Technology Madras",
    location: "Chennai, India",
    description: "Coursework focused on programming, data science...",
    emoji: "🎓",
    emojiBg: "#eab308",
  },
]

export const certifications = [
  {
    description: "Currently building academic and personal projects...",
  },
]

export const sections = [
  { id: "intro", label: "INTRO", icon: "User" },
  { id: "projects", label: "PROJECTS", icon: "Folder" },
  { id: "experience", label: "EXPERIENCE", icon: "Briefcase" },
  { id: "education", label: "EDUCATION", icon: "GraduationCap" },
  { id: "certifications", label: "CERTIFICATIONS", icon: "Award" },
  { id: "contact", label: "CONTACT", icon: "Mail" },
]
```

---

### Phase 3: Components (Steps 5–10)

#### Step 5: Create global CSS

Copy `css/styles.css` → `src/styles/global.css` and `css/responsive.css` → `src/styles/responsive.css`.

Keep CSS variables and all existing rules. Import in `main.jsx`.

#### Step 6: Build `App.jsx` layout

```jsx
import Sidebar from './components/Sidebar'
import FloatingNav from './components/FloatingNav'
import Section from './components/Section'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content" id="main-content">
        <Section id="intro">...</Section>
        <Section id="projects">...</Section>
        <Section id="experience">...</Section>
        <Section id="education">...</Section>
        <Section id="certifications">...</Section>
        <Section id="contact">...</Section>
        <Footer />
      </main>
      <FloatingNav />
    </div>
  )
}
```

#### Step 7: Build `Sidebar.jsx`

Port all sidebar content from HTML. Use data from `portfolio.js`. Replace inline SVG social icons with Lucide React icons.

#### Step 8: Build `FloatingNav.jsx`

Port the floating nav. Use Lucide React icons. Import `useActiveSection` hook for active state.

#### Step 9: Build card components

Create `ProjectCard.jsx`, `ExperienceCard.jsx`, `EducationCard.jsx`, `CertificationCard.jsx`, `ContactTable.jsx`, `Footer.jsx`.

#### Step 10: Build `Section.jsx` wrapper

```jsx
import { motion } from 'motion/react'

export default function Section({ id, label, children }) {
  return (
    <motion.section
      id={id}
      className="content-section"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <h2 className="section-label">{label}</h2>
      {children}
    </motion.section>
  )
}
```

---

### Phase 4: Hooks (Steps 11–12)

#### Step 11: Create `useActiveSection.js`

Port the IntersectionObserver logic from `js/main.js` into a React hook:

```js
import { useState, useEffect } from 'react'

export function useActiveSection(sectionIds) {
  const [activeId, setActiveId] = useState(sectionIds[0])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0.4 }
    )

    sectionIds.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sectionIds])

  return activeId
}
```

#### Step 12: Create `useReducedMotion.js`

```js
import { useState, useEffect } from 'react'

export function useReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
    const handler = (e) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}
```

---

### Phase 5: Smooth Scroll & Animations (Steps 13–15)

#### Step 13: Add Lenis smooth scroll

In `main.jsx`:

```js
import Lenis from 'lenis'

const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
})

function raf(time) {
  lenis.raf(time)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)
```

#### Step 14: Add Motion scroll-triggered reveals

Wrap each section's content in `<motion.div>` with `whileInView` animations. Add staggered entrance for card lists:

```jsx
{projects.map((project, i) => (
  <motion.div
    key={i}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: i * 0.1, duration: 0.4 }}
  >
    <ProjectCard {...project} />
  </motion.div>
))}
```

#### Step 15: Add GSAP ScrollTrigger (Optional)

Only if Motion's viewport detection isn't sufficient. Use for:
- Parallax on project card images
- Timeline-based multi-element reveals
- Advanced scroll-pinned sections

---

### Phase 6: Polish & Deploy (Steps 16–19)

#### Step 16: Replace inline SVGs with Lucide React

Map current inline SVGs to Lucide icons:

| Current | Lucide Icon |
|---------|-------------|
| User (intro nav) | `User` |
| Folder (projects nav) | `Folder` |
| Briefcase (experience nav) | `Briefcase` |
| GraduationCap (education nav) | `GraduationCap` |
| Award (certifications nav) | `Award` |
| Heart (testimonials nav) | `Heart` |
| Mail (contact nav) | `Mail` |
| Twitter/X | `Twitter` |
| Threads | `AtSign` |
| Instagram | `Instagram` |
| LinkedIn | `Linkedin` |
| GitHub | `Github` |
| YouTube | `Youtube` |
| Email (sidebar) | `Mail` |

#### Step 17: Update `index.html` for Vite

Minimal Vite entry:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nitish R.G. — Student Developer & Data Science Enthusiast</title>
    <meta name="description" content="..." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

#### Step 18: Test and verify

- [ ] Visual parity with current static site at 1440px, 1280px, 768px, 430px, 375px
- [ ] All nav links smooth-scroll to correct sections
- [ ] Active nav state updates on scroll
- [ ] Motion reveal animations trigger on scroll
- [ ] Lenis smooth scroll works
- [ ] Reduced-motion preference disables animations
- [ ] No console errors
- [ ] Build succeeds (`npm run build`)
- [ ] Preview works (`npm run preview`)
- [ ] GitHub Pages deployment succeeds

#### Step 19: Deploy

1. Push to `main` branch
2. GitHub Actions builds and deploys
3. Verify at `https://NITISH-R-G.github.io/Portfolio/`

---

## Post-Migration Cleanup

After React version is verified live:

1. Remove original static files:
   - `css/styles.css` (replaced by `src/styles/global.css`)
   - `css/responsive.css` (replaced by `src/styles/responsive.css`)
   - `js/main.js` (replaced by hooks + components)
   - Original `index.html` (replaced by Vite entry)

2. Keep:
   - `assets/` directory (profile.svg, favicon.svg) — now in `public/assets/`
   - All `docs/` files (archived)
   - Screenshot PNGs (optional)

3. Update `README.md` with React + Vite instructions

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Visual regression during migration | High | Screenshot comparison at each phase |
| GitHub Pages base path issues | Medium | Test `npm run preview` with base path before deploy |
| Motion animations causing layout shift | Medium | Use `will-change` and test with `prefers-reduced-motion` |
| Lenis conflicting with native scroll | Low | Lenis replaces CSS `scroll-behavior: smooth` |
| Bundle size increase | Low | Current ~44KB static → expect ~80-120KB gzipped React bundle |
| Google Fonts loading flash | Low | Keep `preconnect` hints, consider font-display: swap |

---

## Acceptance Criteria

- [ ] All current files documented in audit
- [ ] File retention/replacement/archival strategy defined
- [ ] GitHub Pages base path strategy documented
- [ ] No source files deleted yet (original static site preserved)
- [ ] Migration plan is actionable and step-by-step
- [ ] New file structure defined
- [ ] Dependencies listed with versions
- [ ] Component decomposition mapped from HTML
- [ ] Data layer strategy defined
- [ ] Animation approach specified (Motion + Lenis + optional GSAP)
