# Connectors

29 integrations, and an honest account of what each one can actually do.

## Capability levels

This is the most important table in the documentation, because it is the one most tools
get wrong by omission.

| Level | What it means | What you provide |
| --- | --- | --- |
| **api** | Official or stable public API. Imports automatically. | A username |
| **feed** | No API, but a public RSS/Atom/JSON feed — a supported interface meant to be read by programs, not a scrape. | A username or URL |
| **token** | Official API that requires your own credential. | A username and a key in `.env` |
| **manual** | No usable public interface. You supply figures; they are validated, attributed and linked. | Numbers you type |
| **url-only** | No usable public interface and nothing meaningful to type. | A profile URL |

### Why some platforms are manual

LinkedIn, HackerRank, HackerEarth, CodeChef, Devpost, Google Scholar and ResearchGate
publish **no usable public API for profile data**. Their own sites call undocumented,
unversioned endpoints behind bot protection, and their terms prohibit automated access to
profile pages.

Building on that anyway would produce an integration that breaks without warning, and put
you at risk of a terms violation for the sake of a number you could type in ten seconds.
So this project does not. It gives you a real integration instead — a verified profile
link, schema-validated fields, provenance attribution, a place in the setup wizard — and
labels the result **self-reported** rather than pretending a platform confirmed it.

An integration that silently returns nothing is worse than one that tells you why.

---

## The full list

Configure each under `dataSources` in `portfolio.config.js`, keyed by its **id**.

### Code

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `github` | GitHub | **api** | `username` | Projects, languages, topics, stars, contributions |
| `gitlab` | GitLab | **api** | `username` | Projects, stars, forks, topics |
| `bitbucket` | Bitbucket | **api** | `workspace` | Public repositories |

```js
github: {
  username: 'ada',
  includeForks: false,        // default — forks are rarely your own work
  maxRepos: 100,
  exclude: ['dotfiles', 'test-repo'],
  includeOrganizations: false, // org membership is affiliation, not employment
}
```

**GitHub** is the richest connector and needs no credential. A `GITHUB_TOKEN` in `.env`
is optional and changes two things: the rate limit (60 → 5,000 requests/hour) and access
to the GraphQL API, which is the only way to read **pinned repositories** and your
**contribution total**. Without one, those two extras are skipped, the import reports
`partial`, and everything else works.

Language skills are byte-weighted from per-repository breakdowns, counted only over the
repositories that actually appear on your portfolio — so "Python — 12 repositories" is a
number a reader can verify by counting.

**GitLab** supports self-hosted instances via `host: 'https://gitlab.example.com'`.

**Bitbucket** does not expose stars or forks for public repositories, so those figures are
absent rather than guessed.

### Packages and registries

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `npm` | npm | **api** | `username` | Packages, versions, monthly downloads |
| `pypi` | PyPI | **api** | `packages` | Packages, versions, monthly downloads |
| `dockerhub` | Docker Hub | **api** | `username` | Images, pull counts |

```js
npm: { username: 'ada', packages: ['@scope/extra-package'] },
pypi: { packages: ['requests', 'httpx'], username: 'ada' },
dockerhub: { username: 'ada' },
```

**PyPI has no author-search API**, so you list your package names rather than a username.
Download counts come from pypistats.org, which is what the Python Packaging Authority
points at for this; PyPI itself does not serve them.

**npm** download counts are one request per package, capped at 40 per import.

### Models and data

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `huggingface` | Hugging Face | **api** | `username` | Models, datasets, Spaces, likes, downloads |
| `kaggle` | Kaggle | **token** | `username` + credentials | Datasets, notebooks |

```js
huggingface: { username: 'ada', limit: 50 },
kaggle: {
  username: 'ada',
  tier: 'Expert',                     // not available from the API
  competitionMedals: '2 gold, 3 silver',
  globalRank: 412,
},
```

**Kaggle** requires credentials for *every* endpoint. Download `kaggle.json` from your
account settings and set `KAGGLE_USERNAME` and `KAGGLE_KEY` in `.env`.

Competition medals, tier and global ranking are **not exposed by the Kaggle API** — they
exist only on the profile page. Enter them here and they are labelled self-reported. If the
credentials are missing, the connector reports `unavailable` but still keeps those typed
fields, so an expired token costs you the live data rather than the whole section.

### Competitive programming

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `leetcode` | LeetCode | **api** | `username` | Problems by difficulty, contest rating, ranking |
| `codeforces` | Codeforces | **api** | `handle` | Rating, peak rating, rank, contests, problems solved |
| `codechef` | CodeChef | **manual** | — | Rating, stars, contests |
| `hackerrank` | HackerRank | **manual** | — | Badges, certifications, scores |
| `hackerearth` | HackerEarth | **manual** | — | Challenge results |

```js
leetcode: { username: 'ada' },
codeforces: { handle: 'ada_l' },
codechef: { username: 'ada', rating: 1834, stars: 4, problemsSolved: 210, contests: 22 },
hackerrank: { username: 'ada', badges: ['SQL (Gold)', 'Problem Solving (Silver)'] },
```

**Codeforces** has a proper documented public API. Problems solved is counted from the
submission list, de-duplicated, since the API reports submissions rather than a solved
total.

**LeetCode** uses the public GraphQL endpoint its own profile pages call. That is a real
interface against public data, but it is undocumented and unversioned — if it changes, the
import reports a warning and the rest of your portfolio is unaffected. Your profile must
be public.

**HackerEarth's** public API evaluates submitted code; it exposes no profile data at all.

### Research

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `orcid` | ORCID | **api** | `id` | Publications, preprints, name, biography |
| `semanticScholar` | Semantic Scholar | **api** | `authorId` | Publications with citation counts |
| `dblp` | dblp | **api** | `author` or `pid` | CS publications with accurate venues |
| `googleScholar` | Google Scholar | **manual** | — | Citation figures you enter |
| `researchgate` | ResearchGate | **url-only** | — | Profile link |

```js
orcid: { id: '0000-0002-1825-0097' },
semanticScholar: { authorId: '1741101' },
dblp: { author: 'Barbara Liskov', pid: 'l/BarbaraLiskov' },
googleScholar: { id: 'ABC123', citations: 340, hIndex: 9, i10Index: 7 },
```

**Google Scholar has no API and prohibits automated access.** Use `orcid`,
`semanticScholar` or `dblp` instead — all three are official, free, public, and cover the
same work. Most researchers already have all four identifiers. Keep Scholar for the link.

**Semantic Scholar** is the one that supplies citation counts legitimately. The anonymous
rate limit is shared across all users of the API, so an import may need a retry; a free
`SEMANTIC_SCHOLAR_KEY` gives you a dedicated limit.

**h-index is always recomputed** from the publications actually shown, so it matches what
a reader can count. An author-level citation total is kept only when it covers more work
than was imported.

**dblp** covers computer science only and matches by author name — use `pid` if your name
is common.

### Writing

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `hashnode` | Hashnode | **api** | `username` | Posts, tags, reactions, comments |
| `devto` | DEV Community | **api** | `username` | Articles, tags, reactions, comments |
| `medium` | Medium | **feed** | `username` | Recent posts, tags, excerpts |
| `substack` | Substack | **feed** | `publication` | Recent posts |
| `website` | Your own site | **feed** | `url` | Posts from your RSS/Atom/JSON feed |

```js
medium: { username: '@ada' },
substack: { publication: 'ada' },        // or a custom domain
website: { url: 'https://ada.dev' },     // feed auto-discovered
devto: { username: 'ada' },
```

**Medium's API is write-only** — it can publish a post but cannot read a profile. Every
Medium profile publishes an RSS feed, which is the supported interface, so that is what
this reads. Feeds carry roughly the ten most recent posts and **no clap or follower
counts**, so those are absent rather than approximated.

**`website`** tries `/feed.xml`, `/rss.xml`, `/feed`, `/index.xml`, `/atom.xml` and
`/feed.json` before giving up. Set `feedUrl` if yours is elsewhere. It is also the generic
fallback for any platform with a feed but no dedicated connector.

### Video

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `youtube` | YouTube | **feed** | `channelId` | Recent videos, thumbnails, dates |

```js
youtube: { channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', limit: 12 },
```

Without a key it reads the public channel feed: the 15 most recent videos, no view counts.
Set `YOUTUBE_API_KEY` to switch to the official Data API, which adds view counts,
subscriber totals and your full upload history. If a keyed request fails — an exhausted
quota is common — it falls back to the feed and warns, so you keep the videos.

Your channel id starts with `UC` and is under Settings → Advanced settings.

### Community

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `stackoverflow` | Stack Overflow | **api** | `userId` | Reputation, badges, top answers |
| `devpost` | Devpost | **manual** | — | Hackathons you enter |

```js
stackoverflow: { userId: 22656, topAnswers: 3 },
devpost: {
  username: 'ada',
  data: {
    hackathons: [
      { name: 'MedTriage', event: 'HackMIT 2025', result: '1st place', date: '2025-09' },
    ],
  },
},
```

**Stack Exchange** keys users by numeric id, not display name — it is the number in your
profile URL, and pasting the whole URL works. The anonymous quota is 300 requests/day per
IP; this uses two of them.

**Devpost** publishes no documented API, but every submission page is public — link to it
and the result is verifiable even though the entry is typed.

### Social

| id | Platform | Level | Needs | Imports |
| --- | --- | --- | --- | --- |
| `linkedin` | LinkedIn | **manual** | — | Profile link; data via your own export |
| `x` | X (Twitter) | **url-only** | — | Profile link, Twitter Card handle |

**LinkedIn grants third-party applications no access to profile data** and prohibits
automated collection from profile pages. The supported path is the one LinkedIn itself
provides — export your own data under Settings → Data privacy → Get a copy of your data:

```bash
npm run import:file -- ~/Downloads/linkedin-export.zip
```

That reads `Positions.csv`, `Education.csv`, `Skills.csv` and `Certifications.csv` and
turns them into schema records.

**The X API has no free tier** that returns profile or post data. Set the same handle as
`seo.twitterHandle` so shared links unfurl with attribution.

### Anything else

| id | Level | Needs | Imports |
| --- | --- | --- | --- |
| `custom` | **manual** | `label` | Anything in the schema |

```js
custom: {
  label: 'Behance',
  profileUrl: 'https://behance.net/ada',
  data: {
    projects: [{ name: 'Brand system', description: 'Identity work for …' }],
  },
},
customDribbble: { label: 'Dribbble', profileUrl: 'https://dribbble.com/ada' },
```

Suffix the key to configure several — `custom`, `custom2`, `customBehance` all resolve to
the same connector and keep separate links.

If the platform *does* have a public API, a real connector is about eighty lines:
**[adding-a-connector.md](adding-a-connector.md)**.

---

## Credentials

All optional except Kaggle. Copy `.env.example` to `.env` and fill in what you want.

| Variable | Unlocks |
| --- | --- |
| `GITHUB_TOKEN` | 5,000 req/hr instead of 60; pinned repos; contribution total |
| `STACKEXCHANGE_KEY` | 10,000 req/day instead of 300 |
| `SEMANTIC_SCHOLAR_KEY` | A dedicated rate limit instead of the shared pool |
| `YOUTUBE_API_KEY` | View counts, subscriber totals, full upload history |
| `HUGGINGFACE_TOKEN` | Private repositories only |
| `GITLAB_TOKEN` | Self-hosted or internal projects |
| `KAGGLE_USERNAME` + `KAGGLE_KEY` | **Required** for Kaggle |

`.env` is gitignored. These are read by Node during `npm run import` and are never
bundled into the built site. For CI, add them as repository secrets — the included GitHub
Actions workflow passes them through.

---

## How failures behave

Every connector runs in isolation. One failing never affects another and never fails a
build.

| State | Meaning |
| --- | --- |
| `imported` | Ran and returned data |
| `partial` | Ran; something optional was unavailable. Data is usable |
| `empty` | Ran successfully; the account genuinely has nothing |
| `manual` | Your typed data was accepted; nothing was fetched |
| `link-only` | Contributed a profile link, by design |
| `unavailable` | Configured correctly but cannot run here — usually a missing credential |
| `error` | Tried and failed. The message says why, in words you can act on |
| `skipped` | Not enabled, or missing a required field |

`npm run doctor` shows the current state of every source, with how long ago you imported.

**A failed fetch still keeps what you typed.** If your Kaggle token expires, the tier and
medals in your config survive — you lose the live data, not the section.

---

## Refreshing

```bash
npm run import                       # everything
npm run import -- --only github      # one source
npm run import -- --dry-run          # see what would happen, write nothing
```

Output goes to `src/data/generated/`, which is gitignored by default because it is
reproducible from your config. Comment that line out of `.gitignore` if you deploy from a
CI job with no network access to the platforms.

**Refreshing never overwrites your edits.** Corrections live in `src/data/overrides.json`,
a layer above the imported data. See [data-schema.md](data-schema.md#the-layer-model).

The included GitHub Actions workflow re-imports weekly so a deployed portfolio does not go
stale.
