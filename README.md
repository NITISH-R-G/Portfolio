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
npm run import:file -- linkedin-export.zip  # your own LinkedIn data export
```

Merged into `src/data/manual.json`, never overwriting what is already there.

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
| `npm test` | 233 tests over the data pipeline |

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
    standard/            the portable, versioned document
    config/              defaults and resolution
    generate/            ranking, skill derivation, stats, section selection, SEO
    themes/              design tokens and the twelve presets
  sections/              one component per section, driven by data
  components/            reusable UI
  admin/                 the local builder
scripts/                 setup, import, export, doctor, examples
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

**[docs/privacy.md](docs/privacy.md)**

---

## Documentation

[Getting started](docs/getting-started.md) ·
[Connecting sources](docs/connecting.md) ·
[The standard](docs/standard.md) ·
[Canonical identity](docs/identity.md) ·
[Configuration](docs/configuration.md) ·
[Connectors](docs/connectors.md) ·
[Adding a connector](docs/adding-a-connector.md) ·
[Data schema](docs/data-schema.md) ·
[Themes](docs/themes.md) ·
[Customization](docs/customization.md) ·
[Deployment](docs/deployment.md) ·
[Privacy](docs/privacy.md) ·
[Troubleshooting](docs/troubleshooting.md) ·
[Architecture](docs/architecture.md) ·
[Contributing](CONTRIBUTING.md)

---

## Roadmap

The canonical profile is deliberately the centre of the architecture rather than a step in
it, because everything below is a *consumer* of the same object:

- **Role variants** — one identity, many presentations. An AI/ML portfolio and a full-stack
  portfolio as views that reorder and emphasise, never copies. Change your GitHub URL once
  and every view updates.
- **Résumé ingestion** — a `document` layer feeding the same resolver, so an extracted job
  title can legitimately conflict with LinkedIn and be resolved once.
- **Retrieval-backed chat** — answering "what has he built with PyTorch?" by traversing
  skills → evidence → projects, rather than embedding portfolio prose and hoping. The
  canonical profile is the database; the model only phrases the answer.
- **An agent interface** — exposing the profile, sections and themes as tools, so a coding
  agent can extend a portfolio through a defined surface rather than by guessing at files.
- More connectors, more themes, and a static render for zero-JavaScript readers.

None of those are built. The layer they all depend on is, and its seams are named in
[docs/identity.md](docs/identity.md#where-this-is-going).

Contributions welcome, particularly connectors. If a platform has a public API and is not
here yet, that is a good first pull request.

---

## Credits

Built with React 19, Vite 8, Motion, GSAP and Lenis. The reference portfolio in this
repository belongs to [Nitish R.G.](https://github.com/NITISH-R-G) and is a *configuration
instance* of the engine, not a special case in the code — `portfolio.config.js` is the only
file that knows who it is about.

MIT licensed.
