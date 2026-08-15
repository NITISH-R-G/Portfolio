# Configuration

Everything lives in `portfolio.config.js`. Nothing in `src/` needs editing.

Every key has a working default, so your config only contains what you want to change.
This is complete and valid:

```js
import { defineConfig } from './src/core/config/types.js'

export default defineConfig({
  identity: { name: 'Ada Lovelace' },
})
```

Resolution never throws. A typo produces a warning from `npm run doctor` and falls back to
a working value, because one bad field should not stop your site building.

---

## identity

Who the portfolio is about. Anything omitted falls back to what your connectors reported —
GitHub supplies a name, bio, location and avatar, so most of this is optional.

```js
identity: {
  name: 'Ada Lovelace',
  headline: 'Software Engineer',
  summary: 'Two or three sentences. Becomes your About section and meta description.',
  location: 'London, UK',
  avatar: 'assets/profile.svg',   // a path inside public/, or an absolute URL
  pronouns: 'she/her',

  contact: {
    email: 'ada@example.com',
    phone: '+44 …',               // never fetched by any connector
    website: 'https://ada.dev',
  },

  availability: {
    status: 'open',               // 'open' | 'selective' | 'closed'
    label: 'Open to backend and platform roles',
    preferredRoles: ['Backend Engineer', 'Platform Engineer'],
    preferredLocations: ['Remote', 'London'],
    responseTime: 'Usually replies within 24 hours',
    currentAffiliation: 'MSc Computer Science @ UCL',
  },
},
```

Config identity beats imported identity: what you wrote about yourself wins over whatever
a platform's bio field happens to say.

---

## site

```js
site: {
  url: 'https://ada.github.io/portfolio',  // canonical links, OG tags, sitemap
  base: '/portfolio/',                     // see below — this one matters
  title: '',                               // defaults to "Name — Headline"
  description: '',                         // defaults to your summary
  language: 'en',
  ogImage: 'og-image.svg',                 // path inside public/
},
```

### site.base

The single most common cause of a broken deployment.

| Hosting | Value |
| --- | --- |
| GitHub Pages project site | `/your-repo-name/` |
| GitHub Pages user site (`you.github.io`) | `/` |
| Vercel, Netlify, Cloudflare Pages, custom domain | `/` |

Wrong and every asset 404s: the page renders blank with nothing in the console explaining
why. It is normalized for you (`repo` → `/repo/`), checked against `deployment.target` by
`npm run doctor`, and verified in the CI workflow.

---

## theme

```js
theme: {
  preset: 'minimal-dark',
  accent: '#6366f1',        // readable foreground computed automatically
  fontSans: 'Inter, system-ui, sans-serif',
  fontMono: 'ui-monospace, monospace',
  radius: '12px',           // a bare number is read as pixels
  density: 'comfortable',   // 'compact' | 'comfortable' | 'spacious'
  colorScheme: '',          // 'dark' | 'light' | 'system'
  tokens: {},               // override any individual design token
},
```

Twelve presets: `minimal-dark`, `minimal-light`, `editorial`, `glass`, `terminal`,
`academic`, `neo-brutalist`, `developer`, `corporate`, `creative`, `monochrome`, `swiss`.

See **[themes.md](themes.md)**.

---

## layout

```js
layout: {
  shell: 'sidebar',            // 'sidebar' | 'stacked'
  navigation: 'dock',          // 'dock' | 'top' | 'none'
  maxWidth: 'default',         // 'narrow' | 'default' | 'wide' | 'full'
  projectLayout: 'carousel',   // 'carousel' | 'grid' | 'list'
  experienceLayout: 'cards',   // 'cards' | 'timeline'
  avatarStyle: 'circle',       // 'circle' | 'rounded' | 'square'
  socialIconStyle: 'outline',  // 'outline' | 'solid' | 'plain'
  customCursor: true,          // fine-pointer devices only
},
```

---

## sections

Three states, and the default is the interesting one.

```js
sections: {
  publications: 'auto',   // show when there is enough data — the default for everything
  contact: true,          // always show
  languages: false,       // never show
},
```

**`'auto'` is almost always right.** It is what makes an empty section disappear instead of
rendering a heading with nothing under it, and it is why the eleven sample profiles all
produce different portfolios from `sections: {}`.

Forcing a section on renders it empty. Forcing one off keeps it hidden even after you
import the data that would have filled it.

Section ids: `hero`, `about`, `stats`, `projects`, `experience`, `education`, `skills`,
`openSource`, `competitive`, `publications`, `writing`, `packages`, `models`, `videos`,
`hackathons`, `talks`, `achievements`, `certifications`, `languages`, `contact`.

Thresholds (how many records `'auto'` needs): `stats` and `skills` need 3, `writing` and
`videos` need 2, everything else needs 1.

### sectionOrder

```js
sectionOrder: ['hero', 'about', 'projects', 'experience', 'skills', 'contact'],
```

Anything omitted is appended in the canonical order, so adding a section later does not
require editing this. Unknown ids are dropped with a warning rather than silently ignored.

### sectionOptions

```js
sectionOptions: {
  projects: { limit: 6 },
  contact: { cta: 'Available for freelance work' },
},
```

A `limit` caps what renders. The rest stay in your data and in the exports.

---

## dataSources

Keyed by connector id. A connector runs only when its entry exists, `enabled` is not
`false`, and it has the identifiers it needs.

```js
dataSources: {
  github: { username: 'ada' },
  leetcode: { username: 'ada' },
  orcid: { id: '0000-0002-1825-0097' },
  linkedin: { profileUrl: 'https://linkedin.com/in/ada' },
  codechef: { username: 'ada', rating: 1834, stars: 4 },
},
```

Full reference for all 29: **[connectors.md](connectors.md)**.

---

## socialLinks

Extra profile links beyond what connectors contribute.

```js
socialLinks: {
  mastodon: 'https://fosstodon.org/@ada',
},
```

---

## seo

```js
seo: {
  enabled: true,
  structuredData: true,       // JSON-LD Person, ProfilePage, WebSite
  sitemap: true,              // writes sitemap.xml and robots.txt at build
  keywords: ['distributed systems'],   // added to keywords derived from your data
  twitterHandle: '@ada',
},
```

Title, description, Open Graph tags, Twitter Card tags and JSON-LD are generated from your
real data and **baked into the HTML at build time**, because the crawlers and social-card
scrapers that read them do not run JavaScript.

---

## privacy

```js
privacy: {
  hideEmail: false,           // remove it from the page, the JSON-LD and the exports
  obfuscateEmail: true,       // render it against naive scrapers, and omit it from JSON-LD
  excludePrivateRepos: true,
  showDataProvenance: true,   // label figures reported / derived / self-reported
},
```

`obfuscateEmail` also keeps your address out of the structured data. Obfuscation that
leaves a plain `mailto:` in the page head is theatre — that blob is the easiest thing on
the page for a harvester to read.

`showDataProvenance` is what makes the numbers checkable. Turning it off hides where each
figure came from.

---

## analytics

Off by default. No third-party script is bundled and there is nothing to enable.

```js
analytics: {
  endpoint: '',               // a POST endpoint you control, receiving { events: [...] }
  respectDoNotTrack: true,
},
```

Set `VITE_ANALYTICS_ENDPOINT` in `.env` instead to keep it out of your committed config.

---

## features

```js
features: {
  admin: true,          // serve the builder at /admin.html
  exports: true,        // enable npm run export
  evidenceMode: true,   // "Python — 24 repositories" instead of a bare tag
},
```

---

## animations

```js
animations: {
  intensity: 'standard',    // 'none' | 'subtle' | 'standard' | 'expressive'
  smoothScroll: true,
  respectReducedMotion: true,   // always honoured; not actually configurable
},
```

`prefers-reduced-motion` is respected regardless of these settings.

---

## deployment

```js
deployment: {
  target: 'github-pages',   // 'github-pages' | 'vercel' | 'netlify' | 'cloudflare' | 'static'
},
```

Only used by `npm run doctor`, to check `site.base` against where you are actually
publishing. Worth setting for that check alone.

---

## Where else data comes from

`portfolio.config.js` is one of four layers:

```
connector output → src/data/manual.json → config identity → src/data/overrides.json
```

- **connector output** (`src/data/generated/`) — regenerated by `npm run import`, never edited
- **`manual.json`** — anything you write by hand, or import with `npm run import:file`
- **config identity** — the `identity` and `socialLinks` blocks above
- **`overrides.json`** — corrections, hides and pins, produced by the builder

Later layers win. Your overrides survive every re-import, which is the point of the
separation. See **[data-schema.md](data-schema.md)**.
