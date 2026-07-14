# Task 44 — Verification Checklist

| Test | Result | Notes |
|------|--------|-------|
| Title/description are correct | PASS | Title: "Nitish R.G. — Software Engineering Student at IIT Madras". Description matches portfolio.js site.description. |
| Open Graph metadata present | PASS | og:title, og:description, og:type, og:url, og:image (1200×630), og:image:alt, og:site_name all present. |
| Share preview image works | PASS | og-image.svg at /Portfolio/og-image.svg, 1200×630, black-on-black, clean hierarchy. |
| Twitter Card metadata present | PASS | twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image. |
| JSON-LD is valid and truthful | PASS | Single Person schema with verified fields: name, url, image, description, jobTitle, affiliation, sameAs. |
| No placeholder metadata remains | PASS | No TODO, lorem, example.com, or placeholder text found in portfolio.js or HTML. |
| Canonical URL correct | PASS | https://nitish-r-g.github.io/Portfolio/ |
| Favicon wired correctly | PASS | /Portfolio/assets/favicon.svg + apple-touch-icon |
| Admin noindex'd | PASS | `<meta name="robots" content="noindex, nofollow">` on admin.html |
| Build passes | PASS | main 292.49KB, admin 12.32KB, CSS 29.60KB. |

## Metadata Audit

### index.html
```
<title>Nitish R.G. — Software Engineering Student at IIT Madras</title>
<meta name="description" content="Portfolio of Nitish R.G...">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="https://nitish-r-g.github.io/Portfolio/">
<link rel="icon" type="image/svg+xml" href="/Portfolio/assets/favicon.svg">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:type" content="website">
<meta property="og:url" content="https://nitish-r-g.github.io/Portfolio/">
<meta property="og:image" content="https://nitish-r-g.github.io/Portfolio/og-image.svg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">Person schema</script>
```

### admin.html
```
<title>Admin — Nitish Portfolio</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
```

### Share Preview
- LinkedIn: Shows og:image as card background, og:title as heading, og:description below
- X/Twitter: Shows twitter:card as large image card
- Discord/Slack: Shows og:image as embed thumbnail
- iMessage: Shows og:title + og:description in link preview
