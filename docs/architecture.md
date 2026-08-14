# Architecture

This document records (a) the audit of the original repository and (b) the architecture
the project was refactored into.

---

## Part 1 — Audit of the original repository

The repository began life as **one person's portfolio** (Nitish R.G.). It was a well-built
Vite + React 19 single-page app with genuinely good visual work, but every layer assumed a
single owner.

### What existed

| Area | State |
| --- | --- |
| Build | Vite 8, React 19, two entry points (`index.html`, `admin.html`) |
| Motion | `motion` (Framer) + `gsap` + `lenis` smooth scroll |
| Data | One 699-line object literal, `src/data/portfolio.js` |
| UI | 5 live components + 5 dead ones |
| Admin | `src/admin/AdminEditor.jsx`, 1579 lines, writes to `localStorage` |
| Styles | `src/styles/global.css`, 3072 lines, already token-based |
| Deploy | GitHub Pages workflow, `base: "/Portfolio/"` hardcoded |

### Findings

**F1 — Personal data was hardcoded in six separate places.**
`src/data/portfolio.js` (name, role, projects, six jobs, two degrees, five certs, email),
`index.html` (title, description, OG tags, canonical URL, JSON-LD `Person` schema),
`admin.html` (title), `package.json` (name, description), `public/sitemap.xml`,
`public/robots.txt`, and `vite.config.js` (`base: "/Portfolio/"`). Changing owner meant
editing all of them.

**F2 — The data model was presentation-shaped, not domain-shaped.**
Sections carried display concerns (`color`, `icon`, `coverImage`), and the same concept was
modelled differently in different places — e.g. dates were free-text (`"Nov 2025 – Present"`,
`"Jul 2025 – Present"`, `"2025"`, `""`) and so could not be sorted, filtered, or exported.

**F3 — Section rendering was hardcoded and unordered.**
`MainContent.jsx` hardcoded intro → projects → experience → education → certifications in JSX,
then ran a *second*, different mechanism (the `sectionConfigs` array) for twelve more sections.
Order lived in the JSX; `sections.intro.enabled` was read without optional chaining, so
deleting a key crashed the render.

**F4 — Two parallel navigation sources of truth.** `data.navigation[]` (for the dock) and the
section keys under `data.sections` could drift; nothing kept them in sync.

**F5 — Dead code.** `css/` (1153 lines) and `js/main.js` (153 lines) were a complete
pre-React static site that nothing referenced. `ProjectCard`, `ProjectsCoverflow`,
`FloatingNav`, `CursorFollower` and `Section` were unimported. Root `assets/` duplicated
`public/assets/`. 60+ `docs/task-NN-*.md` files were build logs for a finished project.

**F6 — Placeholder content presented as real.** `ProjectCarousel.jsx` shipped a
`PLACEHOLDER_IMAGES` map of Unsplash URLs keyed by *this owner's project ids*, with a fallback
chain that silently served an unrelated stock photo for any unknown project.

**F7 — Duplicated logic.** `deepMerge`, `loadDraft`, `normalizeSkills` and `STORAGE_KEY` were
copy-pasted between `src/hooks/usePortfolio.js` and `src/admin/AdminEditor.jsx`.

**F8 — Theming was half-built.** `global.css` defined good tokens, but `initializeTheme()`
wrote a *different* naming convention (`--background`, `--accent`) than the CSS consumed
(`--color-bg`, `--color-accent`), so the theme object in the data file had no effect. There
was exactly one visual style, hardcoded.

**F9 — No data acquisition of any kind.** Everything was typed by hand. Stars, ratings,
problem counts, citation counts — all manual strings that go stale immediately.

**F10 — No tests, no schema validation, no error handling.** A malformed `localStorage` draft
or a missing section key produced a white screen.

### What was worth keeping

The design system (token names, spacing scale, monochrome surface treatment), the macOS-style
magnifying `Dock`, the `CaseStudyCard` progressive-disclosure pattern, the `CertGallery`, the
horizontal `ProjectCarousel`, the reduced-motion discipline, and the accessibility work
(skip link, `aria-live` navigation status, focus rings). All of these were preserved and made
generic rather than rewritten.

---

## Part 2 — Target architecture

The refactor enforces one rule: **data acquisition, normalization, configuration, and
presentation never touch each other directly.** Each stage communicates through a documented
data structure.

```
 ┌──────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌───────────┐
 │  CONNECTORS  │──▶│  NORMALIZE   │──▶│  MERGE LAYER  │──▶│   GENERATE   │──▶│    UI     │
 │              │   │              │   │               │   │              │   │           │
 │ github       │   │ raw platform │   │ imported data │   │ section      │   │ themes    │
 │ codeforces   │   │ shape        │   │      +        │   │ detection    │   │ sections  │
 │ orcid ...    │   │      ↓       │   │ user overrides│   │ scoring      │   │ components│
 │              │   │ Profile      │   │      +        │   │ stats, SEO   │   │           │
 │ (Node only)  │   │ schema       │   │ manual entry  │   │              │   │ (browser) │
 └──────────────┘   └──────────────┘   └───────────────┘   └──────────────┘   └───────────┘
       fetch              map                merge              derive            render
    build time         build time         build time         build time         runtime
```

### Layer responsibilities

**A. Portfolio data** — `src/core/schema/`
The normalized `Profile` shape. One definition, used by connectors, the merge layer, the
generator, the UI, the admin, and every exporter. Plain JS with JSDoc types so Node scripts
and Vite can both import it with no build step; `npm run typecheck` runs `tsc --checkJs`
over it for real type enforcement.

**B. Connectors** — `src/core/connectors/`
Each connector is a self-contained folder implementing a common interface. Connectors run
**in Node at build time only** — never in the browser, so no keys reach the client. A
connector may not import anything from `src/components` or `src/sections`; the UI never
learns that GitHub exists.

**C. Normalization** — each connector's `mapper.js`
Platform shape → `Profile` shape. Pure functions, no I/O, so they are trivially testable
against recorded fixtures.

**D. Generation** — `src/core/generate/`
Deterministic derivation: which sections to show, which projects are featured, what the
aggregate stats are, what the SEO metadata should be. No network, no randomness, no LLM.

**E. Themes** — `src/core/themes/`
A theme is a plain object of design tokens, not a stylesheet. Applied by writing CSS custom
properties onto `:root`. Adding a theme never touches a component.

**F. UI components** — `src/components/` (primitives) and `src/sections/` (section renderers)
Section renderers are registered in a map keyed by section type. `MainContent` iterates the
resolved section order and looks up renderers — it contains no section-specific JSX.

**G. User configuration** — `portfolio.config.js` at the repo root
The single file a user is expected to edit. Everything else has a working default.

**H. Deployment** — `deploy/` + `.github/workflows/`
Config for GitHub Pages, Vercel, Netlify and Cloudflare Pages. `base` is derived from config,
not hardcoded.

### The three-layer data model

Imported data must be refreshable without destroying hand-written content, so the final
profile is a merge of three layers, lowest priority first:

```
  1. connector output   src/data/generated/sources/*.json   (regenerated by `npm run import`)
  2. manual content     src/data/manual.json                (hand-written / admin-authored)
  3. user overrides     src/data/overrides.json             (field-level pins)
                      ─────────────────────────────────────
                   =  src/data/generated/portfolio.json
```

Layer 1 is disposable and always safe to regenerate. Layers 2 and 3 are never written by the
importer. An override is a field-level pin: it wins over imported data for that field only,
so refreshing GitHub still updates star counts even if you have pinned a project's title.

### Failure isolation

Every connector runs inside its own try/catch with its own timeout. A connector result is
always one of `ok | partial | empty | unavailable | error`, and the outcome is recorded in
`src/data/generated/status.json`. A failed connector contributes nothing and blocks nothing —
the site builds and renders with whatever succeeded. There is no code path where one platform
being down produces a broken page.

### Connector honesty

Connectors declare what they can actually do. No connector fabricates an API that does not
exist, and none attempts to defeat authentication or bot protection.

| Tier | Meaning |
| --- | --- |
| `official-api` | Documented public API, no auth needed |
| `official-api-key` | Documented public API, requires a token you supply |
| `feed` | Public RSS/Atom/JSON feed |
| `unofficial` | Public endpoint that exists but is undocumented and may change |
| `manual` | No usable API — you supply the data; the connector validates and normalizes it |
| `url-only` | No usable API — the platform is linked, not scraped |

See `docs/connectors.md` for the per-platform table and the reasoning behind each tier.
