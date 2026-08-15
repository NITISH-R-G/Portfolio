# The Portfolio Standard

**Version 1.0**

A portable description of a professional identity. One file, versioned, self-describing,
and readable by any renderer — this project is one implementation, not the definition.

```bash
npm run export      # writes exports/portfolio.json
```

---

## Why a standard rather than a format

Your professional identity currently lives in a dozen systems that cannot read each other.
Every portfolio builder, résumé tool and profile site invents its own shape, so moving
between them means retyping everything. The lock-in is not malicious; it is just what
happens when nobody writes the interchange format down.

So the primitive here is the document, not the website. If this project disappeared, a
`portfolio.json` would still be a complete, useful description of a person's work that
another tool could render.

Two properties make that real rather than aspirational:

1. **A document declares its own version.** A reader always knows what it is looking at.
2. **A document never loses what it did not understand.** Anything outside the schema
   survives a round trip under `extensions`.

Without the second property, an "open standard" is just one project's internal shape with a
version number on it — and any tool adopting it would have to fork the moment it needed a
field the author had not thought of.

---

## Shape

```json
{
  "schemaVersion": "1.0",
  "spec": "https://github.com/NITISH-R-G/Portfolio/blob/main/docs/standard.md",

  "meta": {
    "generatedAt": "2026-08-14T18:04:17.329Z",
    "generator": "portfolio-engine",
    "sources": ["github", "orcid"]
  },

  "person": { },
  "socials": { },

  "education":      [],
  "experience":     [],
  "projects":       [],
  "skills":         [],
  "achievements":   [],
  "certifications": [],
  "publications":   [],
  "writing":        [],
  "packages":       [],
  "models":         [],
  "videos":         [],
  "hackathons":     [],
  "talks":          [],
  "competitions":   [],
  "languages":      [],

  "statistics": [],
  "evidence":   [],
  "extensions": { }
}
```

Only `schemaVersion` and `person` are required. Every array may be omitted or empty.

### Required

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | string | The version this document was written against. |
| `person` | object | Who it describes. Must have a `name`. |

### person

```json
{
  "name": "Ada Lovelace",
  "headline": "Analytical Engine Programmer",
  "summary": "Two or three sentences.",
  "location": "London, UK",
  "avatar": "https://example.com/ada.png",
  "pronouns": "she/her",
  "contact": {
    "email": "ada@example.com",
    "phone": "+44 …",
    "website": "https://ada.dev"
  },
  "availability": {
    "status": "open",
    "label": "Open to platform engineering roles",
    "preferredRoles": ["Backend Engineer"],
    "preferredLocations": ["Remote", "London"]
  }
}
```

### Collections

Every record carries an `id`, unique within its collection, and stable across regenerations
so that references and decisions keep applying.

Field reference for each collection: **[data-schema.md](data-schema.md)**. The document uses
the same field names, with three collections renamed for readability outside this codebase:

| In this codebase | In the standard |
| --- | --- |
| `identity` | `person` |
| `posts` | `writing` |
| `competitive` | `competitions` |

### statistics

Figures that are not recomputable from the records in the document — a follower count, a
year's contributions, a reputation score.

```json
{
  "id": "contributions",
  "label": "Contributions",
  "value": 1234,
  "display": "1.2k",
  "note": "in the last year",
  "kind": "fetched",
  "connectors": ["github"]
}
```

`kind` is the important field, and consumers should honour it:

| `kind` | Meaning | Render as |
| --- | --- | --- |
| `fetched` | A platform's API returned this verbatim | "reported" |
| `derived` | Counted from records in this document | *(unlabelled)* |
| `stated` | The subject asserted it; no API could confirm it | "self-reported" |

A renderer that displays a `stated` figure as though a platform had confirmed it is
misrepresenting the document. This distinction is the point of having the field.

---

## Source kinds

Every value in a document came from somewhere, and *which* somewhere changes how much
weight a reader should give it. Five kinds, and the distinctions are load-bearing:

| Kind | Means | Does **not** mean |
| --- | --- | --- |
| `reported` | This source's API returned this value | That it is true, or current |
| `document` / `extracted` | This value was extracted from a document the subject provided | That the extraction was correct |
| `stated` | The subject supplied this directly | That it is unverified in a pejorative sense |
| `verified` | The subject confirmed it after seeing the alternatives | That any third party checked it |
| `inferred` | Derived from other values in this document | That a source asserted it |

**`reported` does not mean "probably true."** It means precisely: *this source reported this
value*. LinkedIn reporting a job title is evidence that LinkedIn holds that title on file —
which may be years stale, or may have been typed wrong by the subject in 2019. A consumer
that renders `reported` as "verified" is misrepresenting the document.

**`stated` is not weaker than `reported`.** It is differently sourced. A person stating
their own headline is more authoritative than a platform's bio field, not less; what
`stated` tells you is that no third party is corroborating it.

**`extracted` carries a specific risk the others do not**: the value may not appear in the
document at all in the form given, because a parser assembled it. This is why extraction is
the one kind that may carry a confidence, and the one whose evidence should point at a page.

### Where source kinds appear

- On each claim in `evidence[].claims[].kind`.
- Implicitly on every record, through `source`:
  - `source.fetchedAt` present → the value was fetched from an API.
  - `source.document` present → the value was extracted from a document.
  - neither → the value was stated or hand-written.

---

## Provenance

Every record may carry a `source`:

```json
{
  "id": "acme-corp-engineer",
  "company": "Acme Corp",
  "role": "Software Engineering Intern",
  "source": {
    "connector": "resume-2026-08",
    "document": {
      "id": "resume-2026-08",
      "filename": "resume.pdf",
      "page": 1,
      "section": "Experience",
      "text": "Software Engineering Intern, Acme Corp — 2022 – 2024",
      "line": 12
    },
    "confidence": 0.9
  }
}
```

| Field | Meaning |
| --- | --- |
| `connector` | The source id — a connector key (`github`) or a document id (`resume-2026-08`). |
| `url` | Where a reader can verify it, for web sources. |
| `fetchedAt` | ISO timestamp. **Present only when an API was genuinely called.** |
| `document` | Present only for document-derived values. See below. |
| `confidence` | 0–1. See *Confidence semantics*. |

`fetchedAt` is the field that distinguishes a platform-reported figure from a typed one.
Producers must not set it for values that were not fetched, and consumers may rely on its
absence.

### Document evidence

```json
{
  "id": "resume-2026-08",
  "filename": "resume.pdf",
  "page": 1,
  "section": "Experience",
  "heading": "Acme Corp",
  "text": "Software Engineering Intern, Acme Corp — 2022 – 2024",
  "line": 12
}
```

Only `id` is required. Everything else is recorded **only when the extractor genuinely knows
it** — a Markdown résumé has headings but no pages, and a plain text file has neither.
Inventing a page number to fill the shape would make the evidence wrong in exactly the place
a person goes to check it.

This is what lets a consumer say *"Source: Resume, page 1"* and let the subject inspect why
a value was extracted.

---

## Confidence semantics

**Confidence exists only where the mechanism producing the value can genuinely compute one.**

| Situation | Confidence |
| --- | --- |
| An API returned `stargazers_count: 42` | **None.** The value is exact, not probable. |
| A JSON Resume was imported | **None**, or `1`. Nothing was inferred. |
| A line under "Experience" was parsed as a role | Yes — the parse is a judgement. |
| An OCR or LLM extractor read a scanned page | Yes, if it reports one. |

Attaching a confidence to API-reported data is a validation **warning** in this
implementation (`confidence-on-exact`), because it makes exact data look uncertain and
uncertain data look no different from exact.

Equally, a confidence must never be *invented* to fill the field. A heuristic parser that
cannot compute a calibrated probability should report the tiered values it can justify — this
implementation uses `exact` (1), `strong` (0.9), `moderate` (0.7) and `weak` (0.5), each
tied to how the value was recognised — rather than a decimal chosen to look precise.

Values outside 0–1 are clamped, and non-numeric values are dropped, with both reported.

---

## User overrides and decisions

A subject editing a value **never mutates the source claim**. Both are retained:

```
resume-2026-08  extracted  "Software Engineering Intern"
linkedin        reported   "Software Engineer"
you             verified   "Software Engineer Intern"   ← effective value
```

This matters for auditability and for re-processing: a better extractor can revisit the
original claim later, and a reader can see what was changed and from what.

Decisions are recorded against the *fact*, not the value:

```json
{
  "resolutions": {
    "experience/acme-corp:role": { "source": "resume-2026-08" },
    "identity:headline": { "value": "Platform Engineer" }
  }
}
```

Keying by fact is what makes a decision survive a re-import that re-asserts the rejected
value. A decision whose named source no longer exists is reported as stale rather than
silently ignored — the value shown is then one the subject did not choose, and hiding that
would be worse than the conflict.

---

## evidence

Optional, and the reason a document can be *audited* rather than merely read.

Where two sources disagreed about a value, the losing claims are kept alongside the winner:

```json
{
  "evidence": [
    {
      "subject": "experience/acme-corp",
      "attribute": "role",
      "claims": [
        {
          "value": "Software Engineer",
          "source": "linkedin",
          "kind": "reported",
          "observedAt": "2026-08-12T00:00:00Z"
        },
        {
          "value": "Software Engineering Intern",
          "source": "resume",
          "kind": "extracted",
          "observedAt": "2026-04-02T00:00:00Z"
        }
      ]
    }
  ]
}
```

Only disputed attributes appear — a unanimous value's provenance is already on the record
itself. A consumer may ignore `evidence` entirely; the resolved values in the collections
are complete without it.

Each claim may also carry `document` and `confidence`, with the meanings given above. See
*Source kinds* for what each `kind` does and does not assert.

---

## extensions

Anything the standard does not model. This is what stops the schema being a cage.

```json
{
  "extensions": {
    "customSections": {
      "exhibitions": [
        {
          "id": "tate-2025",
          "title": "Group show, Tate Modern",
          "date": "2025-03",
          "description": "Three pieces from the flow-field series."
        }
      ]
    },
    "vendor:someTool": { "anything": "at all" }
  }
}
```

Rules for consumers:

- **Preserve what you do not understand.** If you read a document and write it back, every
  key under `extensions` must survive unchanged.
- **Namespace vendor keys.** `vendor:yourtool` avoids collisions with future standard keys.
- **`customSections`** is reserved: a map of section name to an array of records, each with
  at least `title`. This implementation renders them as ordinary sections.

An achievement no platform tracks — a shooting medal, a community role, a language
certification — belongs here or in `achievements`, and is a first-class part of the
document either way.

---

## Versioning

`MAJOR.MINOR`.

- **MINOR** rises when optional fields are added. Older readers keep working; they ignore
  what they do not recognise.
- **MAJOR** rises only when something breaks — a field removed, renamed, or given a new
  meaning.

A reader should:

```
same major, any minor  →  read it, ignore unknown fields
different major        →  refuse, and say so
no schemaVersion       →  assume 1.0, warn
```

This implementation does exactly that; see `validateDocument` in
`src/core/standard/document.js`.

---

## Producing and consuming

```bash
npm run export                              # produce
npm run import:file -- portfolio.json       # consume
```

Programmatically:

```js
import { toDocument, fromDocument, validateDocument } from './src/core/standard/document.js'

const document = toDocument(profile, { includeEvidence: true, evidence })

const { profile: restored, issues } = fromDocument(document)
const { valid, counts } = validateDocument(document)
```

`fromDocument` is forgiving on purpose: a document from another tool, or a future minor
version, must load rather than be rejected. It reports what it dropped instead of dropping
it silently.

---

## Relationship to JSON Resume

[JSON Resume](https://jsonresume.org) is a good standard for a *résumé* — a document about
employment history, aimed at print. This project exports it too (`exports/resume.json`) and
imports it.

The Portfolio Standard covers things a résumé has no place for, because they are the
evidence a technical portfolio runs on:

- repositories, packages, models and datasets with their usage counts
- competitive-programming ratings and problem counts
- publications with citation counts
- provenance: which platform said what, and when
- the disagreements between sources, and who resolved them

If you only need a résumé, use JSON Resume. If you need a portfolio built from verifiable
evidence, a résumé schema cannot express it.

---

## Implementing a renderer

The minimum:

1. Read `schemaVersion`; refuse a different major.
2. Render `person`, then whichever collections are non-empty.
3. **Show nothing for an empty collection.** An empty heading reads as an unfinished
   portfolio.
4. Honour `statistics[].kind` when labelling figures.
5. Preserve `extensions` if you write documents back.

Point 3 is what makes a document render well for a researcher with no packages and a
maintainer with no publications, without either configuring anything away.

---

## Status

Version 1.0, and honest about what that means: it is used in production by one
implementation. It is written down, versioned, tested and stable enough to build against,
but it has not yet been through the argument with other implementers that turns a format
into a standard.

If you are building something that consumes or produces professional-identity data, that
argument is the most useful contribution available — open an issue.
