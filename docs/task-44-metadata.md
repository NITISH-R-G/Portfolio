# Task 44 — Metadata + Discoverability Pass

## Part 1: Head Metadata

### index.html — Complete Metadata Stack
| Meta Tag | Value | Status |
|----------|-------|--------|
| `<title>` | Nitish R.G. — Software Engineering Student at IIT Madras | ✅ Matches portfolio identity |
| `<meta name="description">` | Portfolio of Nitish R.G., a software engineering student at IIT Madras with experience in AI/ML, full-stack development, and competitive programming. | ✅ Matches `site.description` |
| `<meta name="theme-color">` | #000000 | ✅ Black-on-black palette |
| `<meta name="color-scheme">` | dark | ✅ Dark mode |
| `<link rel="canonical">` | https://nitish-r-g.github.io/Portfolio/ | ✅ GitHub Pages URL |
| `<link rel="icon">` | /Portfolio/assets/favicon.svg | ✅ SVG favicon |
| `<link rel="apple-touch-icon">` | /Portfolio/assets/favicon.svg | ✅ Apple touch icon |

### Open Graph
| Property | Value | Status |
|----------|-------|--------|
| og:title | Nitish R.G. — Software Engineering Student at IIT Madras | ✅ |
| og:description | Portfolio of Nitish R.G... | ✅ |
| og:type | website | ✅ |
| og:url | https://nitish-r-g.github.io/Portfolio/ | ✅ |
| og:image | https://nitish-r-g.github.io/Portfolio/og-image.svg | ✅ 1200×630 SVG |
| og:image:width | 1200 | ✅ |
| og:image:height | 630 | ✅ |
| og:image:alt | Nitish R.G. — Software Engineering Student at IIT Madras | ✅ |
| og:site_name | Nitish R.G. Portfolio | ✅ |

### Twitter Card
| Property | Value | Status |
|----------|-------|--------|
| twitter:card | summary_large_image | ✅ |
| twitter:title | Nitish R.G. — Software Engineering Student at IIT Madras | ✅ |
| twitter:description | Portfolio of Nitish R.G... | ✅ |
| twitter:image | https://nitish-r-g.github.io/Portfolio/og-image.svg | ✅ |

### admin.html
| Tag | Value | Status |
|-----|-------|--------|
| `<title>` | Admin — Nitish Portfolio | ✅ |
| `<meta name="robots">` | noindex, nofollow | ✅ Prevents indexing |
| `<meta name="theme-color">` | #000000 | ✅ |

## Part 2: Social Preview Image

### og-image.svg
- **Format**: SVG (scalable, lightweight, ~6.7KB)
- **Dimensions**: 1200×630 (standard OG)
- **Style**: Black-on-black with layered surfaces (#000, #080808, #111)
- **Content**: Name "Nitish R.G.", role, skill pills (Python, ML, Full-Stack, React, TypeScript, AWS), stats line, URL
- **Readability**: High contrast text (#f0f0f0) on dark backgrounds, clean hierarchy
- **Platform compatibility**: Works on LinkedIn, X/Twitter, Discord, Slack, iMessage

## Part 3: Structured Data (JSON-LD)

### Schema: Person
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Nitish R.G.",
  "url": "https://nitish-r-g.github.io/Portfolio/",
  "image": "https://nitish-r-g.github.io/Portfolio/assets/profile.svg",
  "description": "Software engineering student at IIT Madras...",
  "jobTitle": "Software Engineering Student",
  "affiliation": {
    "@type": "Organization",
    "name": "Indian Institute of Technology Madras"
  },
  "sameAs": ["https://github.com/NITISH-R-G"]
}
```

### Design Decisions
- **Single Person block** — one authoritative identity, not multiple conflicting schemas
- **Only truthful fields** — name, url, image, description, jobTitle, affiliation, sameAs all verified on the site
- **No stuffed data** — omitted education dates, skills, certifications (not reliable in schema)
- **sameAs** — only GitHub (the only verified external profile)

## Part 4: Content Sanity

### Links Verified
| Link | Target | Status |
|------|--------|--------|
| Favicon | /Portfolio/assets/favicon.svg | ✅ Exists in public/assets |
| Profile image | /Portfolio/assets/profile.svg | ✅ Exists in public/assets |
| OG image | /Portfolio/og-image.svg | ✅ Exists in public/ |
| Canonical URL | https://nitish-r-g.github.io/Portfolio/ | ✅ Correct GitHub Pages URL |
| Email | mailto:nitishrg.8220psgps2020@gmail.com | ✅ Real email |
| GitHub | https://github.com/NITISH-R-G | ✅ Real profile |
| Project links | https://github.com/NITISH-R-G | ✅ All point to GitHub profile |

### Metadata Consistency
- Title in `<head>` matches `site.title` in portfolio.js ✅
- Description in `<head>` matches `site.description` in portfolio.js ✅
- No placeholder text remaining anywhere ✅
- No TODO comments in metadata ✅
