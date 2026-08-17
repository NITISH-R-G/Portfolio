# Data schema

One normalized `Profile` shape. Every connector produces it, every section renders it, and
every export is another view of it.

Everything passes through `normalizeProfile`, which is deliberately forgiving: unknown
fields are dropped, malformed records are skipped, loose values are coerced. It never
throws. Genuine problems are reported by `validateProfile` — surfaced in `npm run doctor` —
which reports without discarding.

---

## The layer model

The most important thing to understand, because it is what makes refreshing safe.

```
src/data/generated/sources/*.json   connector output — regenerated, never edited
        ↓
src/data/manual.json                anything you write by hand
        ↓
portfolio.config.js  →  identity    what you say about yourself
        ↓
src/data/overrides.json             corrections, hides and pins
        ↓
        the portfolio
```

Later layers win. Imported data is **never edited in place**, so `npm run import` can
replace every source file and your corrections survive — they were never mixed into the
source data to begin with.

Layers are not merged blindly. Each is flattened into individual *claims* first, so that
two sources disagreeing becomes a conflict you can resolve rather than a value silently
discarded — and so any published value can be traced back to who asserted it. See
**[identity.md](identity.md)**.

Within a collection, records are matched across layers by `id`. Give a hand-written record
the same `id` as an imported one and they merge; give it a new one and it is added.

### Overrides

```json
{
  "identity": { "headline": "Principal Engineer" },
  "socials": { "github": "https://github.com/ada" },
  "records": {
    "projects": {
      "github-my-repo": { "description": "A better description than the repo has." }
    }
  },
  "hidden": { "projects": ["github-old-experiment"] },
  "order": { "projects": ["github-best-thing", "github-second-best"] }
}
```

- `records` — patch named fields on one record; everything else stays imported
- `hidden` — omit a record entirely, **including from the totals it contributed to**
- `order` — pin ids to the front; the rest keep their computed ranking
- `resolutions` — decide which source wins when two disagree; keyed by the fact, so a
  re-import re-asserting the rejected value does not undo it
- A patch whose id matches nothing becomes a record of its own, so a hand-written entry
  never silently vanishes when an upstream id changes

```json
{
  "resolutions": {
    "experience/acme-corp:role": { "source": "resume" },
    "identity:headline": { "value": "Platform Engineer" }
  }
}
```

Produced by the builder at `/admin.html`, or written by hand.

---

## Identity

```ts
identity: {
  name: string
  headline?: string
  summary?: string
  location?: string
  avatar?: string          // path inside public/, absolute URL, or data: URI
  pronouns?: string
  contact?: {
    email?: string         // validated before it becomes a mailto:
    phone?: string         // never written by a connector
    website?: string
    links?: Link[]
  }
  availability?: {
    status?: 'open' | 'selective' | 'closed'
    label?: string
    interests?: string[]
    preferredRoles?: string[]
    preferredLocations?: string[]
    responseTime?: string
    currentAffiliation?: string
  }
}
```

`identity.contact.phone` and `identity.pronouns` are user-owned: no connector may write
them, so a refresh cannot overwrite what you typed.

---

## Collections

Every collection is an array and always exists, so consumers iterate without guarding.

### projects

```ts
{
  id: string
  name: string                    // required
  description?: string
  technologies?: string[]
  repository?: string
  liveUrl?: string
  image?: string
  stars?: number
  forks?: number
  primaryLanguage?: string
  topics?: string[]
  featured?: boolean              // an explicit pin outranks any computed score
  date?: DateValue
  updatedAt?: DateValue
  status?: 'active' | 'completed' | 'archived' | 'wip'
  isFork?: boolean

  // Case-study fields, all optional
  role?: string
  problem?: string
  approach?: string
  impact?: string
  lessons?: string

  metrics?: Metric[]
  links?: Link[]
  source?: Provenance
}
```

### experience

```ts
{
  id: string
  company: string                 // required
  role?: string
  location?: string
  employmentType?: 'full-time' | 'part-time' | 'internship' | 'contract' | 'freelance' | 'volunteer'
  dates?: DateRange
  description?: string
  highlights?: string[]
  technologies?: string[]
  metrics?: Metric[]
  links?: Link[]
  source?: Provenance
}
```

### education

```ts
{
  id: string
  institution: string             // required
  degree?: string
  field?: string
  location?: string
  dates?: DateRange
  grade?: string
  description?: string
  courses?: string[]
  achievements?: string[]
  source?: Provenance
}
```

### skills

```ts
{
  name: string                    // required
  category?: string               // 'Languages' | 'AI & ML' | 'Frontend' | … | anything
  proficiency?: number            // 1–5
  weight?: number                 // drives ordering
  evidence?: [{
    label: string                 // "24 repositories"
    count?: number
    connector?: string
    url?: string
  }]
  source?: Provenance
}
```

Evidence is the point. `"Python"` with `"24 repositories"` beneath it is a checkable
statement; `"Expert in Python"` is not. Several connectors can contribute evidence for the
same skill and it is merged.

Skills are also derived automatically from project technologies and topics, so a connector
does not have to emit them.

### publications

```ts
{
  id: string
  title: string                   // required
  authors?: string[]
  venue?: string
  type?: 'journal' | 'conference' | 'preprint' | 'thesis' | 'chapter' | 'other'
  date?: DateValue
  abstract?: string
  doi?: string
  url?: string
  citations?: number
  source?: Provenance
}
```

h-index is computed from these, so it always matches what a reader can count.

### competitive

```ts
{
  platform: string                // required
  connector?: string
  username?: string
  url?: string
  rating?: number
  maxRating?: number
  rank?: string                   // "Master", "5★"
  maxRank?: string
  problemsSolved?: number
  contests?: number
  globalRank?: number
  breakdown?: Record<string, number>   // { easy: 180, medium: 340, hard: 120 }
  metrics?: Metric[]
  source?: Provenance
}
```

### packages

```ts
{
  id: string
  name: string                    // required
  registry: string                // required — 'npm' | 'PyPI' | 'Docker Hub' | …
  description?: string
  version?: string
  url?: string
  repository?: string
  downloads?: number
  downloadsPeriod?: 'last-day' | 'last-week' | 'last-month' | 'total'
  keywords?: string[]
  updatedAt?: DateValue
  source?: Provenance
}
```

### models

```ts
{
  id: string
  name: string                    // required
  kind: 'model' | 'dataset' | 'space'   // required
  url?: string
  description?: string
  likes?: number
  downloads?: number
  tags?: string[]
  updatedAt?: DateValue
  source?: Provenance
}
```

### The rest

| Collection | Required | Notable optional fields |
| --- | --- | --- |
| `achievements` | `title` | `organization`, `rank`, `date`, `url` |
| `certifications` | `name` | `issuer`, `date`, `credentialId`, `credentialUrl`, `image` |
| `posts` | `title` | `url`, `date`, `excerpt`, `tags`, `reactions`, `comments` |
| `videos` | `title` | `url`, `thumbnail`, `date`, `views` |
| `hackathons` | `name` | `event`, `result`, `role`, `date`, `technologies` |
| `talks` | `title` | `event`, `venue`, `audience`, `format`, `date` |
| `languages` | `name` | `level` (1–5), `label` |

### custom

Anything the schema does not model:

```json
{
  "custom": {
    "exhibitions": [
      { "title": "Group show, Tate Modern", "date": "2025-03", "description": "…" }
    ]
  }
}
```

Declare `sections: { exhibitions: 'auto' }` and it renders through the generic section
component, with the same visibility rules as everything else.

---

## Shared types

### DateValue and DateRange

Dates are parsed to a normalized form that keeps the precision you gave:

```ts
DateValue = { iso: string, precision: 'year' | 'month' | 'day' }
DateRange = { start?: DateValue, end?: DateValue, current?: boolean }
```

Accepted: `2024`, `2024-03`, `2024-03-15`, `Mar 2024`, `March 2024`, `03/2024`,
`March 15, 2024`, `15 March 2024`, ISO timestamps. Anything unparseable becomes
`undefined` rather than a wrong date, and calendar-invalid dates like `2023-02-30` are
rejected rather than silently rolled over.

Precision is preserved so a year-only date renders as "2024", not "1 January 2024".

### Provenance

```ts
{
  connector: string        // which connector produced this
  url?: string             // where a reader can verify it
  fetchedAt?: string       // ISO timestamp — present only if genuinely fetched
}
```

**`fetchedAt` is the honesty signal.** Only a connector that really called an API sets it.
Its absence is how a self-reported figure is distinguished from a platform-confirmed one,
and it drives the "reported" vs "self-reported" label the UI shows.

### Metric

```ts
{ label: string, value: string, numeric?: number, note?: string }
```

### Link

```ts
{ label: string, url: string, rel?: string }
```

Only `http:`, `https:` and `mailto:` survive normalization. This is a security boundary,
not a formatting nicety — imported data is untrusted, and a `javascript:` URL rendered
into an `href` would be an XSS vector.

### Stats

Computed by `deriveStats`, not usually written by hand:

```ts
{
  id: string
  label: string
  value: number
  display?: string          // "1.3k"
  note?: string
  kind: 'fetched' | 'derived' | 'stated'
  connectors?: string[]
}
```

| `kind` | Meaning | Shown as |
| --- | --- | --- |
| `fetched` | A platform's API reported this verbatim | "reported" |
| `derived` | Counted from records on the page | *(no label)* |
| `stated` | The portfolio owner typed it | "self-reported" |

`derived` stats are recomputed on every build, so hiding a record updates its totals.
`fetched` and `stated` survive, because nothing on the page could reproduce them.

---

## Importing existing data

```bash
npm run import:file -- resume.json          # JSON Resume
npm run import:file -- profile.yaml
npm run import:file -- resume.md            # read by its headings
npm run import:file -- linkedin-export.zip  # your own LinkedIn export
```

Merged into `src/data/manual.json`, backing up what was there. Markdown import is
necessarily approximate — it maps the headings it recognises and drops the rest rather than
guessing — so treat it as a starting point you edit.
