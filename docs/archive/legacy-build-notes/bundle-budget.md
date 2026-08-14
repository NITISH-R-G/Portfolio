# Bundle Budget

## Baseline (Task 54)

| Chunk | Size | Gzipped | Notes |
|-------|------|---------|-------|
| global (shared) | 216.94 KB | 69.07 KB | React, Motion, GSAP, Lucide |
| main | 295.22 KB | 103.11 KB | Portfolio components |
| CaseStudyCard (lazy) | 4.22 KB | 1.38 KB | Below-fold, lazy loaded |
| CertGallery (lazy) | 5.78 KB | 1.79 KB | Below-fold, lazy loaded |
| admin | 37.94 KB | 9.44 KB | Separate entry |
| CSS | 41.06 KB | 6.85 KB | All styles |
| **Total public** | **562 KB** | **182 KB** | First load |
| **Total admin** | **301 KB** | **86 KB** | First load |

## Budget Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| main.js (gzipped) | > 120 KB | > 150 KB |
| admin.js (gzipped) | > 15 KB | > 25 KB |
| CSS (gzipped) | > 10 KB | > 15 KB |
| Total first load (public) | > 220 KB | > 300 KB |

## How to Check

```bash
npm run build 2>&1 | Select-String "dist/"
```

## Guidelines

- Admin stays separate entry (never merge into main)
- Below-fold components (CertGallery, CaseStudyCard) stay lazy
- New admin-only components go in admin bundle
- New public components: evaluate if below-fold → lazy load
- Never add a new library without checking bundle impact
- Shared chunk (React/Motion/GSAP) is fixed — don't add to it
