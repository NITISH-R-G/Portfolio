# Portfolio Engine

**Connect your profiles. Your portfolio builds itself.**

Your developer identity already exists across the internet — repositories on GitHub,
answers on Stack Overflow, papers on ORCID, packages on npm, ratings on Codeforces. This
turns that scattered evidence into one canonical professional profile, and renders a
portfolio from it.

> **One person → one canonical profile → unlimited presentations.**
>
> The portfolio website is an *output*, not the product. The primitive is a portable,
> versioned document describing a professional identity — with provenance for every fact
> and a record of where your sources disagreed. See [the standard](docs/standard.md) and
> [canonical identity](docs/identity.md).

```bash
git clone https://github.com/NITISH-R-G/Portfolio.git my-portfolio
cd my-portfolio
npm install
npm run setup     # who you are, which profiles to connect, how it should look
npm run import    # fetches your data
npm run dev       # http://localhost:5173
```

No React required. No editing section components. One config file, and it is optional.

---

## Try it in five seconds

Before connecting anything, look at what it produces:

```bash
npm run example -- list
npm run example -- researcher
npm run dev
```

Eleven sample profiles — software engineer, ML engineer, data scientist, competitive
programmer, researcher, student, open-source maintainer, and more. Each one produces a
*different set of sections*, because the sections are chosen from the data rather than
from a template. `npm run example -- restore` puts your own files back.

---

## What makes it different

### It shows evidence, not adjectives

Most portfolios assert. This one counts.

| Instead of | You get |
| --- | --- |
| "Expert in Python" | **Python** — 24 repositories, 5 featured projects |
| "Competitive programmer" | **1,250+ problems solved** · peak rating 2,287 (Codeforces) |
| "Published researcher" | **17 publications**, 340 citations, h-index 9 |

Every number is traceable. Each one is labelled by where it came from:

- **reported** — a platform's API returned this figure
- **derived** — this project counted it from the records shown on the page
- **self-reported** — you typed it, because that platform publishes no API

That third label is the one that matters. It exists so the tool never presents your own
claim as a platform's confirmation.

### Sections appear only when you have earned them

Nothing renders an empty heading. No publications means no Publications section — and no
configuration to remove it. Connect a Google Scholar alternative later and it appears on
its own. The same `sections: {}` default drives every one of the eleven sample profiles,
and they all come out different.

### It is honest about what it cannot do

Several platforms a technical portfolio genuinely needs — LinkedIn, HackerRank, CodeChef,
Devpost, Google Scholar — publish **no usable public API**, and reaching their data anyway
would mean scraping pages their terms forbid and their bot protection is built to stop.

This project does not ship that. It says so instead, in the setup wizard, in the builder,
in the docs, and in `npm run import` output:

| Level | Meaning |
| --- | --- |
| **Automatic** | Official or stable public API. Works with just your username. |
| **Feed** | No API, but a public RSS/Atom feed exists — a supported interface, not a scrape. |
| **Needs a credential** | Official API that requires your own key. |
| **Manual** | No public interface. You supply figures; they are validated, attributed and linked. |
| **Link only** | No public interface and nothing meaningful to type. Contributes a verified link. |

An integration that silently returns nothing is worse than one that tells you why.

### It resolves your sources instead of merging them

LinkedIn says you were a *Software Engineer* at Acme. Your résumé says *Software
Engineering Intern*. Every aggregator picks one silently and throws the rest away — which
is fine until it picks wrong, and your portfolio quietly claims a title you never held.

This shows you:

```
Role — Acme Corp                                    UNDECIDED

  ● Software Engineer
    linkedin · seen today · verify

  ○ Software Engineering Intern
    resume · seen 6 months ago · verify
```

You decide once. The decision is stored against the *fact*, so the next import re-asserting
the value you rejected does not undo it.

Sources that merely add to each other are combined rather than disputed: two connectors
listing different technologies for one project are unioned, and a star count that changed
between syncs is not a disagreement. Only genuine contradictions reach you.
[How it works →](docs/identity.md)

### Refreshing never destroys your edits

Imported data is never edited in place. Corrections live in a separate layer:

```
connector output → manual.json → config identity → your overrides → the portfolio
```

So `npm run import` can replace every source file and your wording survives. Hide a
project and its stars leave the totals too — the portfolio will not advertise a number
whose evidence it is not showing.

### Anything no platform knows about is first-class

A shooting medal, a community role, a language certification. Add it to
`src/data/manual.json`, or declare a whole section the schema does not model. It resolves
through the same pipeline, gets the same provenance handling, and survives export under
`extensions` — so adopting the standard never means losing what makes you unusual.

---

## Integrations

29 connectors. Everything marked **Automatic** works with nothing but a username.

**Code** — GitHub · GitLab · Bitbucket
**Packages** — npm · PyPI · Docker Hub
**Models & data** — Hugging Face · Kaggle *(needs a credential)*
**Competitive** — LeetCode · Codeforces · CodeChef *(manual)* · HackerRank *(manual)* · HackerEarth *(manual)*
**Research** — ORCID · Semantic Scholar · dblp · Google Scholar *(manual)* · ResearchGate *(link only)*
**Writing** — Hashnode · DEV · Medium *(feed)* · Substack *(feed)* · your own site *(feed)*
**Community** — Stack Overflow · Devpost *(manual)*
**Video** — YouTube
**Social** — LinkedIn *(manual)* · X *(link only)*
**Anything else** — Custom

Every connector fails independently. One expired token never breaks a deploy, and a source
that cannot fetch still keeps whatever you typed into it.

Every source reports its own health — connected, partial, stale, needs a credential, rate
limited — with when it last actually succeeded and what changed since. A failed run never
erases the memory of the last good one.

Full capability notes: **[docs/connectors.md](docs/connectors.md)** ·
Connecting and health: **[docs/connecting.md](docs/connecting.md)**.

---

## Themes

Twelve built-in themes, each a configuration object rather than a separate implementation:

`minimal-dark` · `minimal-light` · `editorial` · `glass` · `terminal` · `academic` ·
`neo-brutalist` · `developer` · `corporate` · `creative` · `monochrome` · `swiss`

```js
theme: { preset: 'editorial', accent: '#7c2d12', density: 'spacious' }
```

Set an accent and the readable foreground colour is computed for you, so a custom colour
can never produce unreadable buttons. Override individual design tokens if you want to go
further. **[docs/themes.md](docs/themes.md)**

---

## Readable by people *and* by machines

Publish once. A recruiter reads the page; a search engine reads the JSON-LD; an AI agent reads
a manifest built for it.

**Search that understands what you meant.** Press `⌘K` / `Ctrl-K`. "Projects involving computer
vision" finds work described as "object detection with OpenCV" — and every result shows *why*
it matched and what backs it, so it can be checked rather than trusted. Deterministic, offline,
no API key.

**Copy → Markdown or Prompt.** On the whole profile or any single entry. The prompt carries
grounding instructions — use only this, say so when unsupported, cite the evidence — so a
recruiter can paste it into ChatGPT, Claude or Gemini and get answers anchored to what the
portfolio actually says.

**A public manifest.** Every build emits `portfolio.json` beside the page and declares it in
the head, so any tool handed the URL can find it:

```html
<link rel="alternate" type="application/portfolio+json" href="./portfolio.json">
```

It is a security boundary, not a dump: phone numbers are never published, `privacy.hideEmail`
and `privacy.obfuscateEmail` are enforced at the serializer, and losing claims on disputed
values stay private.

**An npm package for anyone's portfolio** — not just this one:

```bash
npm install @portfolio-engine/agent
```

```js
const portfolio = await PortfolioAgent.fromUrl('https://example.com/portfolio/')
portfolio.search('projects involving machine learning')
portfolio.findSkill('Python')     // → 12 repositories, and where it is used
portfolio.toPrompt()
```

It reads the published manifest, never the rendered UI, so it survives a complete redesign.
**[docs/agents.md](docs/agents.md)** · **[packages/agent](packages/agent#readme)**

---

## One source of truth

Your portfolio is not the only place your profile has to live:

```bash
npm run export
```

| File | What it is |
| --- | --- |
| `portfolio.json` | **The Portfolio Standard document** — versioned, portable, auditable |
| `resume.json` | [JSON Resume](https://jsonresume.org) — feeds every theme in that ecosystem |
| `resume.md` | A plain-text-friendly résumé |
| `README.md` | A GitHub profile README |
| `profile.md` | The whole portfolio as one Markdown document |
| `bio.txt` | One-line, short and long bios for forms and social profiles |

Same data, so they never disagree with the site and never need updating twice.

`portfolio.json` is the one that matters. It declares its own version, preserves anything
outside the schema under `extensions`, and optionally carries the evidence behind disputed
values — so another renderer could consume it, and this project disappearing would not
strand your data. [Read the spec →](docs/standard.md)

---

## Migrating what you already have

```bash
npm run import:file -- resume.json          # JSON Resume
npm run import:file -- profile.yaml         # YAML
npm run import:file -- resume.md            # a Markdown résumé
npm run import:file -- resume.pdf           # PDF or DOCX
npm run import:file -- linkedin-export.zip  # your own LinkedIn data export
```

A document is a source like any connector, with its own identity and confidence tiers
rather than a one-time text dump:

- **Content-hash versions.** Re-importing an edited résumé creates a new version of the
  same document; an unchanged file is recognised as unchanged rather than re-added. Only
  the active version contributes claims, and superseded ones stay on disk for provenance.
- **Named confidence, not invented decimals.** `exact` (the file carried structured data),
  `strong` (a dated role line under an Experience heading), `moderate` (a heading or list
  read loosely), `weak` (segmented out of prose) — comparable across a PDF, a DOCX and a
  Markdown résumé, because they share one reader.
- **Evidence with a page and a span.** A value extracted from a document can say "page 1,
  under Experience," so a person can check whether the extractor read it correctly — which
  matters because, unlike an API response, extraction can be wrong in ways only the author
  would notice.

Merged into `src/data/manual.json` alongside connector data, never overwriting what is
already there, and resolved through the identical claims → conflicts → canonical profile
pipeline every other source uses. **[docs/identity.md](docs/identity.md#documents-as-sources)**

---

## Reading the web: an extraction benchmark, not a scraper

For a URL nothing above already knows how to read — a personal site, a lab page, a
portfolio nobody has written a connector for — this project answers one question
experimentally rather than assuming an answer: *how much of a professional profile can be
recovered, and how sure can it be?*

```bash
npm run benchmark              # every provider, scored on frozen fixtures
npm run benchmark -- --misses  # every field missed, wrong, or invented
```

Two escalation tiers exist today, cheapest first:

| Tier | What it does | Cost |
| --- | --- | --- |
| **Built-in** | JSON-LD, microdata, OpenGraph, headings, links. No browser, no key. | ~1 ms |
| **Playwright** | Renders the page in Chromium, then reads it with *the same* extractor. | ~400 ms |

A URL is escalated to the browser only when the cheap read shows signs of failure — scripts
with almost no text, a heading with nothing under it — not on every page. Someone connecting
thirty sources should pay milliseconds for the ones that are ordinary HTML.

**Nine metrics, never blended into one score**, because the ways extraction fails are not
interchangeable — finding half the facts and getting them right is a different failure from
finding everything and inventing a third of it:

```
recall · accuracy · precision · structure · entity resolution · dates
evidence · evidence validity · forbidden-conclusion traps
```

The last one is the hard gate. The corpus includes pages built specifically to test whether
a footer credit, an unrelated article, a co-author's affiliation, or a client logo gets
turned into an unsupported claim — "worked with Google's API" must never become "employed
by Google." **Every extracted value competes as a claim and can lose to what you typed
yourself** — nothing here writes the canonical profile directly.

Deterministic today; the benchmark itself, not a chosen vendor, is what will decide whether
a further tier is worth its cost. **[benchmarks/README.md](benchmarks/README.md)**

---

## Deploying

```bash
npm run deploy:check   # diagnoses the config, then builds
```

Works on **GitHub Pages** (workflow included, refreshes your data weekly),
**Vercel** (`vercel.json`), **Netlify** (`netlify.toml`) and **Cloudflare Pages**
(`public/_headers`). It is a static site — no server, no database, no hosted backend, and
nothing to pay for.

`npm run doctor` checks the one thing that most often breaks a deployment: `site.base`
must be `/your-repo-name/` on GitHub Pages and `/` almost everywhere else. Get it wrong
and every asset 404s with nothing in the console to explain it.

**[docs/deployment.md](docs/deployment.md)**

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Guided setup — identity, sources, theme, hosting |
| `npm run import` | Fetch every configured source |
| `npm run import -- --only github` | Refresh one source |
| `npm run import -- --dry-run` | See what would be imported, write nothing |
| `npm run dev` | Dev server, with the builder at `/admin.html` |
| `npm run doctor` | Explain what will render, what will not, and why |
| `npm run export` | Résumé, profile README and machine-readable exports |
| `npm run example -- list` | Try a sample profile |
| `npm run build` | Static site into `dist/` |
| `npm test` | 400+ tests over the pipeline, documents and extraction |
| `npm run benchmark` | Score extraction against a frozen corpus — [details](benchmarks/README.md) |
| `npm run test:agent` | Test the agent package on its own |

---

## The builder

`npm run dev`, then open **`/admin.html`** — a local tool for the parts that are easier to
see than to type: reviewing what was imported, correcting it, ordering sections, trying
themes. It runs the real pipeline, so the preview *is* the build rather than an
approximation of it.

It never writes to disk and says so. Changes come out as two files you commit:
`src/data/overrides.json` and a `portfolio.config.js` patch. Everything it does can be
typed by hand instead.

---

## Architecture

Strict separation, which is what makes new integrations cheap:

```
portfolio.config.js      your configuration — the only file most people edit
src/
  connectors/            one directory per platform; the only code that knows an API exists
  core/
    schema/              the normalized Profile shape, merging, validation
    identity/            claims → conflicts → canonical profile + evidence
    documents/           résumé/PDF/DOCX ingestion, content-hash versioning
    extraction/          reading a URL nothing else knows: built-in + Playwright, escalation
    standard/            the portable, versioned document
    config/              defaults and resolution
    generate/            ranking, skill derivation, stats, section selection, SEO
    themes/              design tokens and the twelve presets
  sections/              one component per section, driven by data
  components/            reusable UI
  admin/                 the local builder
scripts/                 setup, import, export, doctor, examples
benchmarks/              frozen-corpus extraction benchmark, scored on nine metrics
examples/                eleven sample profiles
```

The flow, and the reason each stage is separate:

```
sources ──▶ claims ──▶ conflicts ──▶ CANONICAL PROFILE ──▶ presentation ──▶ portfolio
                          │                  │
                     you decide          the standard
                       (once)          (portfolio.json)
```

A connector turns one platform's response into the shared schema. Nothing downstream —
not the pipeline, not a section, not the builder — ever learns which platform a record
came from except through `record.source`. Adding a platform means adding one directory,
never touching the UI.

**[docs/architecture.md](docs/architecture.md)**

---

## Adding a connector

Roughly eighty lines:

```js
export default {
  id: 'example',
  name: 'Example',
  category: 'code',
  availability: 'api',
  summary: 'What it imports.',
  limits: 'What it cannot do, and why.',
  fields: [{ key: 'username', label: 'Username', required: true }],
  identify: (cfg) => cfg.username,
  async fetch(cfg, ctx) { return ctx.http.json(`https://api.example.com/${cfg.username}`) },
  normalize(raw, cfg, ctx) { return { projects: [/* schema shape */] } },
}
```

Register it in `src/connectors/index.js`. The setup wizard, the builder, the docs and the
import script all read the registry, so none of them need changing.

**[docs/adding-a-connector.md](docs/adding-a-connector.md)**

---

## Privacy

- No account, no hosted service, no telemetry. Nothing is sent anywhere you did not configure.
- Every credential is optional, read from `.env` by Node during the import, and never bundled into the site.
- Only public profile data is fetched. Private repositories are never read.
- `privacy.hideEmail` removes your address everywhere; `privacy.obfuscateEmail` also keeps
  it out of the JSON-LD, where a harvester would read it most easily of all.
- Analytics are off by default, and there is no third-party script to turn on.

**[docs/privacy.md](docs/privacy.md)** · Found a security issue? **[SECURITY.md](SECURITY.md)**

---

## Documentation

[Getting started](docs/getting-started.md) ·
[Connecting sources](docs/connecting.md) ·
[The standard](docs/standard.md) ·
[Canonical identity](docs/identity.md) ·
[Configuration](docs/configuration.md) ·
[Connectors](docs/connectors.md) ·
[Adding a connector](docs/adding-a-connector.md) ·
[Agents & the manifest](docs/agents.md) ·
[Extraction benchmark](benchmarks/README.md) ·
[Data schema](docs/data-schema.md) ·
[Themes](docs/themes.md) ·
[Customization](docs/customization.md) ·
[Deployment](docs/deployment.md) ·
[Privacy](docs/privacy.md) ·
[Security](SECURITY.md) ·
[Troubleshooting](docs/troubleshooting.md) ·
[Architecture](docs/architecture.md) ·
[Contributing](CONTRIBUTING.md) ·
[Code of Conduct](CODE_OF_CONDUCT.md)

---

## Roadmap

### Built

- **Canonical identity** — claims, conflicts, evidence, resolution. [docs/identity.md](docs/identity.md)
- **Document ingestion** — résumé/PDF/DOCX, content-hash versioning, named confidence tiers.
- **Extraction, Tier 0 and Tier 1** — a dependency-free reader plus a browser-rendering
  fallback, escalating only when the cheap read falls short, scored on a nine-metric
  benchmark. [benchmarks/README.md](benchmarks/README.md)
- **Machine-readable publishing** — a public manifest with a real privacy boundary, head
  autodiscovery, deterministic search, Markdown and grounded-prompt exports, and an npm
  package that reads any conforming portfolio. [docs/agents.md](docs/agents.md)

### Not built — explicitly deferred, not implemented under a different name

- **Semantic extraction (Tier 2)** — a constrained model interpreting text a deterministic
  reader locates but cannot disambiguate (which part of a citation is the title; "worked
  *with* Google" versus "worked *at* Google"). Gated on holding the same forbidden-conclusion
  guarantee the deterministic tiers already meet — recall that increases invented claims is
  not an improvement here.
- **Role variants** — one identity, many presentations. An AI/ML portfolio and a full-stack
  portfolio as views that reorder and emphasise, never copies. Change your GitHub URL once
  and every view updates.
- **Retrieval-backed chat** — answering "what has he built with PyTorch?" by traversing
  skills → evidence → projects, rather than embedding portfolio prose and hoping. The
  canonical profile is the database; the model only phrases the answer.
- **An agent interface (MCP or similar)** — exposing the profile, sections and themes as
  tools, so a coding agent can extend a portfolio through a defined surface rather than by
  guessing at files.
- More connectors, more themes, and a static render for zero-JavaScript readers.

The layer everything above depends on is built: resolution returns an evidence graph, the
standard carries it, and every source type — API, feed, document, extracted URL, manual —
converges on the same claim model. Its seams are named in
[docs/identity.md](docs/identity.md#where-this-is-going).

Contributions welcome, particularly connectors. If a platform has a public API and is not
here yet, that is a good first pull request.

---

## Credits

Built with React 19, Vite 8, Motion, GSAP and Lenis. The reference portfolio in this
repository belongs to [Nitish R.G.](https://github.com/NITISH-R-G) and is a *configuration
instance* of the engine, not a special case in the code — `portfolio.config.js` is the only
file that knows who it is about.

[MIT licensed](LICENSE).
