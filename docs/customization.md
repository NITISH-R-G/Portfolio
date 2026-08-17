# Customization

Everything below is configuration. None of it requires editing a component.

---

## Without touching code

| What | Where |
| --- | --- |
| Theme | `theme.preset` — twelve built in |
| Accent colour | `theme.accent` — contrast computed for you |
| Fonts | `theme.fontSans`, `theme.fontMono` |
| Corner radius | `theme.radius` |
| Spacing | `theme.density` — `compact`, `comfortable`, `spacious` |
| Any design token | `theme.tokens` |
| Page shell | `layout.shell` — `sidebar` or `stacked` |
| Navigation | `layout.navigation` — `dock`, `top`, `none` |
| Content width | `layout.maxWidth` |
| Project display | `layout.projectLayout` — `carousel`, `grid`, `list` |
| Experience display | `layout.experienceLayout` — `cards`, `timeline` |
| Avatar shape | `layout.avatarStyle` |
| Social icons | `layout.socialIconStyle` |
| Section visibility | `sections` |
| Section order | `sectionOrder` |
| Records per section | `sectionOptions.<id>.limit` |
| Animation | `animations.intensity` |
| Custom cursor | `layout.customCursor` |
| Evidence lines | `features.evidenceMode` |
| Provenance labels | `privacy.showDataProvenance` |

Or use the builder — `npm run dev`, then `/admin.html` — and paste the result in.

---

## Presets that change a lot at once

**Understated, for a job application:**

```js
theme: { preset: 'corporate', density: 'comfortable' },
layout: { shell: 'stacked', navigation: 'top', projectLayout: 'list', customCursor: false },
animations: { intensity: 'subtle', smoothScroll: false },
```

**Academic:**

```js
theme: { preset: 'academic' },
layout: { shell: 'stacked', navigation: 'top', experienceLayout: 'timeline' },
sectionOrder: ['hero', 'about', 'publications', 'education', 'experience', 'talks', 'contact'],
```

**Terminal:**

```js
theme: { preset: 'terminal' },
layout: { shell: 'stacked', projectLayout: 'list', avatarStyle: 'square' },
animations: { intensity: 'none' },
```

**Maximum evidence, minimum decoration:**

```js
theme: { preset: 'monochrome', density: 'compact' },
layout: { maxWidth: 'wide', projectLayout: 'grid' },
features: { evidenceMode: true },
privacy: { showDataProvenance: true },
```

---

## Reordering sections

```js
sectionOrder: [
  'hero', 'about', 'stats', 'publications', 'projects',
  'experience', 'education', 'skills', 'contact',
],
```

Anything omitted is appended in canonical order, so this does not need updating when a new
section appears. Drag-and-drop equivalents live in the builder's Sections panel.

Order what a reader should see first. A researcher leads with publications; a maintainer
leads with open source.

---

## Emphasising content

**Pin a project.** `featured: true` in an override outranks the computed score:

```json
{ "records": { "projects": { "github-my-best": { "featured": true } } } }
```

GitHub pinned repositories are honoured automatically when a `GITHUB_TOKEN` is set.

**Fix the order explicitly:**

```json
{ "order": { "projects": ["github-best", "github-second"] } }
```

Ids not listed keep their computed ranking and follow the pinned ones.

**Turn a project into a case study.** These fields render as expandable detail:

```json
{
  "records": {
    "projects": {
      "github-my-repo": {
        "role": "Sole author",
        "problem": "Deploys took 22 minutes and blocked the whole team.",
        "approach": "Rebuilt the CI cache strategy around content-addressed layers.",
        "impact": "Median deploy time fell to 4 minutes.",
        "lessons": "The cache key was the whole problem; the rest was noise."
      }
    }
  }
}
```

---

## A section the schema does not model

Declare a custom section and fill it from `manual.json`:

```js
// portfolio.config.js
sections: { exhibitions: 'auto' },
sectionOptions: { exhibitions: { label: 'Exhibitions', icon: 'Palette' } },
```

```json
// src/data/manual.json
{
  "custom": {
    "exhibitions": [
      {
        "title": "Group show, Tate Modern",
        "subtitle": "Generative work",
        "date": "2025-03",
        "description": "Three pieces from the flow-field series.",
        "links": [{ "label": "Catalogue", "url": "https://example.com/catalogue" }]
      }
    ]
  }
}
```

It renders through the generic section component with the same auto-visibility rules as
everything else. No component to write.

---

## Editing components

Only if the above genuinely does not cover it.

| File | Renders |
| --- | --- |
| `src/sections/HeroSection.jsx` | Name, headline, avatar, availability |
| `src/sections/ProjectsSection.jsx` | Dispatches to carousel / grid / list |
| `src/sections/SkillsSection.jsx` | Skills with evidence lines |
| `src/sections/StatsSection.jsx` | The "By the numbers" strip |
| `src/sections/GenericSection.jsx` | Every collection without a bespoke component |
| `src/sections/registry.jsx` | Maps a section id to a component |
| `src/components/` | Shared UI |
| `src/styles/global.css` | All portfolio styles |

Sections receive already-processed data — ranked, merged, overridden — so a component only
decides presentation. If you find yourself adding platform-specific logic to a component,
it belongs in a connector instead.

To add a section with a bespoke component: write it in `src/sections/`, add a definition to
`SECTION_DEFINITIONS` in `src/core/generate/sections.js` (including its `count` function
and threshold), and register it in `src/sections/registry.jsx`.

---

## Keeping your fork updatable

If you plan to pull upstream changes, keep your edits in:

- `portfolio.config.js`
- `src/data/manual.json`
- `src/data/overrides.json`
- `theme.tokens`, for visual changes

Those are the files designed to hold your content. Editing `src/` works, but conflicts on
every update.
