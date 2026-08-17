# Canonical identity

**One person → one canonical profile → unlimited presentations.**

Not one person → one portfolio website. That distinction is the architecture.

---

## The problem this solves

You already describe yourself in a dozen places, and they already disagree.

LinkedIn says you were a *Software Engineer* at Acme. Your résumé says *Software
Engineering Intern*. Your GitHub bio says something else again, written two years ago and
never updated. Every aggregator that has ever tried to combine these does the same thing:
it picks one, silently, and throws the rest away.

That is fine right up until it picks wrong — at which point your portfolio quietly claims a
title you never held, and there is nothing on screen to tell you.

So this project does not merge sources. It **resolves** them, and keeps the working.

---

## Claims, not fields

A profile here is not a document that each source overwrites in turn. It is a set of
**claims**:

> LinkedIn said your role at Acme was "Software Engineer", observed on 12 August 2026.

Every source is flattened into claims *before* anything is combined:

```
subject     experience/acme-corp
attribute   role
value       "Software Engineer"
source      linkedin
kind        reported
observedAt  2026-08-12T00:00:00Z
```

Because disagreement is representable, it can be shown to the only person qualified to
resolve it. A last-write-wins merge cannot do this — it destroys the losing value before
anyone knows there was a disagreement.

### Claim kinds

| Kind | Meaning |
| --- | --- |
| `verified` | You confirmed it |
| `reported` | A platform's API returned it |
| `stated` | You typed it |
| `extracted` | Parsed from a document, such as a résumé |
| `inferred` | Derived from other data |

There is deliberately **no confidence percentage**. A connector that read the GitHub API
knows the star count is exactly what GitHub said — that is not "97% confident", it is
reported. An optional `confidence` exists only for sources that can genuinely produce one,
such as a résumé extractor reporting how sure it is that a line was a job title. Putting a
number on everything else would manufacture precision that does not exist, which is the
same dishonesty as presenting a typed figure as a platform's confirmation.

A connector's kind is read from the data, not declared: only a connector that genuinely
called an API stamps `source.fetchedAt`. The same signal drives the **reported** /
**self-reported** labels on the rendered page, so the two can never disagree.

---

## How a value is chosen

### 1. Attribute policy

Not every difference is a disagreement. Getting this right is most of what separates a
useful identity model from a naive diff.

| Policy | Applies to | Behaviour |
| --- | --- | --- |
| `union` | `technologies`, `topics`, `tags`, `keywords`, `courses` | Combine and de-duplicate. Never a conflict. |
| `newest` | `stars`, `forks`, `downloads`, `citations`, `rating`, … | Most recent observation wins. Never a conflict. |
| `first` | `authors` | Order carries meaning; the highest-precedence list wins whole. |
| `preferred` | everything else | One value wins. Disagreement **is** a conflict. |

Two connectors listing different technologies for one project are not in conflict — they
each saw part of the truth. Two connectors reporting different star counts are not in
conflict either — one is simply older. Only genuine disagreement about a single-valued fact
deserves your attention, because a list full of noise is a list nobody reads.

### 2. Layer precedence

```
override  ›  config  ›  manual  ›  [ connector = document ]
```

This is the **primary** key, and it is what guarantees an import never overwrites what you
wrote. What you say about yourself beats what a platform's bio field happens to hold.

**Connectors and documents deliberately tie.** Both are evidence *about* you, obtained from
somewhere; neither is a statement *by* you. Ranking one above the other by type would
decide every LinkedIn-versus-résumé disagreement on a coin-flip of architecture — a
six-month-old résumé beating a profile synced this morning, or the reverse, for no reason
connected to which is actually right.

### 3. Recency, then kind

Only when two layers of the *same* precedence disagree — two connectors, or a connector and
a document — do recency and claim kind decide. The alternative would be alphabetical order
by filename, which means nothing.

Where recency cannot settle it either, the disagreement surfaces as a conflict for the only
person who can resolve it.

---

## Conflicts

A conflict is raised only when **two independently-obtained sources** disagree about a
single-valued fact.

Specifically *not* a conflict:

- **Your config disagreeing with a connector.** You typed it; you already decided.
- **An override.** Same reasoning.
- **Values differing only in case or whitespace.**
- **A `union` or `newest` attribute.**

Résumé-derived data belongs to a `document` layer rather than `manual` for exactly this
reason: it is evidence *about* you, not a statement *by* you, so it can legitimately
contradict LinkedIn.

### Documents as sources

```bash
npm run import:file -- ~/Documents/resume.pdf
```

The result is written to `src/data/documents/` as a source in its own right — not merged
into `manual.json`. It carries its own id, filename, import timestamp, extraction method
and per-value evidence, so a claim can be traced back to the page and section it came from:

```
Role — Acme Corp                                              UNDECIDED

  ● Software Engineer
    linkedin · seen today
    Also says this: portfolio.config.js

  ○ Software Engineering Intern
    resume.pdf · page 1 · Experience · extraction confidence 90%
    “Software Engineering Intern, Acme Corp — 2022 – 2024”
```

Supported: `.pdf`, `.docx`, `.md`, `.txt`, `.json`, `.yaml`, and a LinkedIn export `.zip`.
See [connecting your sources](connecting.md) for the onboarding flow.

**`.docx` and `.md` read far more reliably than `.pdf`.** A PDF stores glyph-drawing
instructions rather than text, so extraction is a reconstruction; where it cannot be done
honestly — a scanned page, a custom font encoding — the importer refuses and says why
rather than publishing plausible-looking garbage as your experience.

`--manual` folds the extraction into `manual.json` instead, discarding the provenance. It
exists for one-off transcriptions you intend to edit, and is not the default.

#### One identity, many versions

A document has a **stable id**; each import is a **version**, keyed by a hash of the file's
contents.

```
resume                        ← the identity: what claims are attributed to
├── sha256:3f1fa869…  active  ← October's edit
└── sha256:a2c04e17…          ← August's, kept for provenance
```

This is not bookkeeping. Dating the *identity* — `resume-2026-08`, `resume-2026-09` — would
mean:

- re-importing the same file creates a second source that disagrees with the first;
- updating your résumé manufactures a conflict with your previous résumé;
- every decision you made about the old one stops applying, because it names a source that
  no longer contributes.

With a stable id, re-importing identical content is recognised (`Already imported`), an
edited file becomes v2 of the same source, and **decisions naming it still hold**. Only the
active version contributes claims; superseded ones stay readable so the provenance of a
value you resolved months ago can still be inspected.

Pin an older version from the builder if a bad import went in — the mistake stays on disk
and stops being published, rather than having to be deleted.

### Resolving one

In the builder — `npm run dev`, then `/admin.html#conflicts`:

```
Role — Acme Corp                                    UNDECIDED

  ● Software Engineer
    linkedin · seen today · verify

  ○ Software Engineering Intern
    resume · seen 6 months ago · verify

  Currently using linkedin because it was observed most recently.
```

Or by hand, in `src/data/overrides.json`:

```json
{
  "resolutions": {
    "experience/acme-corp:role": { "source": "resume" }
  }
}
```

A typed replacement works too:

```json
{
  "resolutions": {
    "experience/acme-corp:role": { "value": "Platform Engineer" }
  }
}
```

### Why the decision survives

The resolution is keyed by the **fact**, not by the value and not by the import. So when
LinkedIn re-asserts "Software Engineer" on the next sync, your decision still stands.

That is the entire reason for storing a decision rather than editing the field: an edit is
undone by whatever writes the field next, and a decision is not.

`npm run doctor` reports anything you have not yet reviewed.

---

## Evidence

Every claim is kept, not just the winner:

```js
import { evidenceFor, sourcesFor } from './src/core/identity/resolve.js'

evidenceFor(identity, 'experience/acme-corp', 'role')
// → [{ value: 'Software Engineer', source: 'linkedin', kind: 'reported', … },
//    { value: 'Software Engineering Intern', source: 'resume', … }]
```

This is what lets any published value be traced back to who asserted it and when — and what
makes an exported document *auditable* rather than merely portable. Disputed values are
included in `portfolio.json` under `evidence`.

---

## Adding something no source knows about

A shooting medal. A community role. A language certification. Nothing can import these, and
nothing may drop them.

Put it in `src/data/manual.json` like anything else:

```json
{
  "achievements": [
    { "title": "Air Rifle Shooting — State Gold", "date": "2025-03", "organization": "State Championship" }
  ]
}
```

Or declare a whole section the schema does not model — see
[customization.md](customization.md#a-section-the-schema-does-not-model). Both resolve
through the same pipeline, get the same provenance handling, and export under
`extensions.customSections`.

---

## Where this is going

The canonical profile is deliberately the *centre* of the architecture rather than a step
in it, because several planned features are all consumers of the same object:

```
                    CANONICAL PROFILE
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   Role variants      Portfolio site      AI chat
   (AI/ML, research)  (themes, layout)    (retrieval)
```

**Role variants** — one identity, many presentations. An AI/ML portfolio and a full-stack
portfolio are *views* over the canonical profile that reorder and emphasise, never copies.
Change your GitHub URL once and every view updates.

**Retrieval for chat** — answering "what has he built with PyTorch?" by traversing skills →
evidence → projects, rather than embedding a blob of portfolio prose and hoping.

**Better extraction** — a real PDF pipeline, or an LLM-assisted extractor. The
`DocumentImporter` interface exists so that replacing `src/core/documents/importers/pdf.js`
touches nothing else: the resolver, the schema, the conflict UI and the standard all stay
as they are. An extractor that produces genuinely calibrated probabilities can report them
directly through the existing `confidence` field.

Document ingestion itself is built. Role variants and chat are not, and the seams they need
are already here: resolution returns an evidence graph, the standard carries it, and every
source type — API, feed, document, manual — converges on the same claim model.

---

## Reference

| File | Role |
| --- | --- |
| `src/core/identity/types.js` | Vocabulary: claims, kinds, precedence |
| `src/core/identity/claims.js` | Layers → claims; the attribute policy table |
| `src/core/identity/resolve.js` | Claims → canonical profile, conflicts, evidence |
| `src/core/standard/document.js` | The portable document |
| `src/data/overrides.json` | Your decisions |

Tests: `tests/identity.test.js`.
