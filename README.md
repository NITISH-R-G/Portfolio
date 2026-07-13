# Nitish R.G. — Student Developer & Data Science Enthusiast Portfolio

A clean, responsive, single-page portfolio inspired by the Resumx Framer template. Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build step.

## Folder Structure

```
.
├── index.html          # Main HTML document
├── css/
│   ├── styles.css      # Core styles (dark theme, layout, components)
│   └── responsive.css  # Breakpoints: 1024px, 768px, 480px
├── js/
│   └── main.js         # Navigation, smooth scroll, active state
├── assets/
│   ├── profile.svg     # Profile avatar (NR initials)
│   └── favicon.svg     # Favicon (N initial)
├── visual-review.md    # Visual regression notes
├── final-qa-report.md  # Full QA checklist
└── build-log.md        # Sprint-by-sprint build history
```

## Local Preview

### Option 1: npx serve (recommended)
```bash
npx serve .
```
Opens at `http://localhost:3000` (or next available port).

### Option 2: VS Code Live Server
1. Install "Live Server" extension
2. Right-click `index.html` → "Open with Live Server"

### Option 3: Python
```bash
python -m http.server 8000
```
Opens at `http://localhost:8000`.

> **Important:** Always use a local HTTP server. Opening `index.html` directly via `file://` breaks module scripts, font loading, and some CSS features.

## Customization Guide

### Profile Avatar
Replace `assets/profile.svg` with your own 120×120px SVG, or edit the existing file:
```xml
<text x="60" y="60" ...>NR</text>  <!-- Change initials -->
```

### Favicon
Replace `assets/favicon.svg` (32×32px) or add additional formats:
```html
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
```

### Project Content
Edit the **Projects** section in `index.html`:
```html
<div class="project-card">
  <div class="project-image-wrapper">
    <div class="project-image project-image-1"></div>
    <div class="project-logo" style="background:#your-color">📊</div>
  </div>
  <div class="project-info">
    <h3 class="project-title">Your Project Name</h3>
    <p class="project-description">One-sentence purpose.</p>
    <div class="project-meta">
      <span>Tech 1</span>
      <span>Tech 2</span>
      <span>Tech 3</span>
    </div>
    <a href="#contact" class="project-link">View details →</a>
  </div>
</div>
```
- Add/remove `.project-card` blocks as needed
- Update `.project-image-N` gradients in `css/styles.css`

### Social Links
Edit the sidebar social icons in `index.html`:
```html
<a href="https://github.com/yourusername" class="social-icon" aria-label="GitHub">
  <svg>...</svg>
</a>
```
Replace `href="#"` with real URLs. Keep `aria-label` for accessibility.

### Colors (CSS Variables)
All colors are defined in `css/styles.css`:
```css
:root {
  --bg: #0D0D0D;        /* Page background */
  --surface: #1A1A1A;   /* Card backgrounds */
  --accent: #FFFFFF;    /* Primary text */
  --muted: #9A9A9A;     /* Secondary text (WCAG AA) */
  --radius: 12px;       /* Border radius */
  --font: 'Inter', sans-serif;
}
```
Change these values to re-theme the entire site.

## Deployment

### GitHub Pages
1. Push this folder to a GitHub repository
2. Settings → Pages → Source: "Deploy from a branch" → `main` / `/root`
3. Site lives at `https://<username>.github.io/<repo>/`

> **Note:** If deploying to a subpath (e.g., `username.github.io/repo`), all relative paths in `index.html` already work correctly because they use relative paths (`css/styles.css`, not `/css/styles.css`).

### Netlify Drop
1. Go to `https://app.netlify.com/drop`
2. Drag the project folder onto the page
3. Get a live `*.netlify.app` URL instantly

### Vercel (Static)
```bash
npx vercel
```
Follow prompts. Deploys to `*.vercel.app`.

### Any Static Host
Upload the entire folder contents to:
- Firebase Hosting (`firebase deploy`)
- Cloudflare Pages
- AWS S3 + CloudFront
- Surge.sh (`surge .`)

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Blank page / styles missing | Opened via `file://` protocol | Use `npx serve .` or Live Server |
| CSS not loading | Wrong path in `<link>` | Ensure `href="css/styles.css"` (relative) |
| JavaScript not working | Script blocked or error | Check browser console; ensure `<script defer>` |
| Fonts not loading | `file://` blocks cross-origin | Use local server |
| GitHub Pages 404 on assets | `base` path mismatch | Use relative paths (already done) |
| Horizontal scroll on mobile | Element wider than viewport | Check `max-width: 100%` on images/containers |
| Nav not highlighting on scroll | IntersectionObserver not firing | Ensure sections have matching `id` attributes |

## Accessibility Notes
- Skip link (press Tab once)
- Focus outlines on all interactive elements
- ARIA labels on icon-only buttons
- WCAG AA contrast (6.3:1 for muted text)
- Semantic heading hierarchy (h1 → h2 → h3)
- Touch targets ≥ 44×44px on mobile

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License
MIT — Free to use, modify, and deploy.

---

Built with vanilla web technologies. Inspired by [Resumx](https://www.framer.com/community/marketplace/templates/resumx/).