# The extraction benchmark

> Given a public professional profile URL, how accurately can we turn the page into canonical
> portfolio claims?

That is the question this directory answers. Not "which scraper is best" — scraping is a
means. What matters is how much of a person's professional identity survives the trip from a
web page to the claims the resolver publishes, and how much of what arrives is *right*.

```bash
npm run benchmark                  # summary table
npm run benchmark -- --detail      # per-case scores
npm run benchmark -- --misses      # every field missed, wrong, or invented
npm run benchmark -- --case <slug> # one page
npm run benchmark -- --json        # machine-readable, for tracking over time
```

## Why this exists before any provider was chosen

The obvious way to pick an extraction provider is to try the popular ones and keep whichever
feels best. That produces a decision nobody can defend six months later, and it systematically
favours whichever was tried first.

So the order here is deliberate: build the measuring apparatus, establish what the project can
already do with no dependencies, and only then ask a paid provider what it adds. A hosted
renderer that turns out to add four points of recall over a parser we already have is a
different purchase from one that adds forty — and there is no way to tell which without the
number.

The benchmark is a first-class asset of the project, not scaffolding. "We build your
professional identity from the web automatically" is a product promise, and this is the only
thing that says whether it is true.

## What is measured

| Metric | Question |
| --- | --- |
| **Recall** | Of everything on the page, how much was found? |
| **Accuracy** | Of what was found, how much was right? |
| **Precision** | Of what was produced, how much was real? |
| **Structure** | Did records land in the right collection? |
| **Entities** | Were "Google" and "Google LLC" understood to be one employer? |
| **Dates** | Were ranges, precisions and "Present" read correctly? |
| **Evidence** | Can each correct value be traced to where it came from? |
| **Failures** | How often was there no usable output at all? |
| **Latency** | How long did it take? |

They are reported separately and never blended. An extractor that finds half the fields and
gets them all right is useful — you can trust what it gives you. One that finds everything and
gets a third wrong is worse than useless, because it *looks* complete. A single blended score
puts both at 50%.

**Precision is the metric that keeps the others honest.** Recall alone rewards emitting
everything imaginable, and a page's navigation menu becomes six job titles. `og-only.html`
exists solely to catch that: it is a studio landing page with no person on it, and the correct
extraction is almost nothing.

Rates are computed over *fields*, not over cases, so a page with forty facts weighs more than
one with three.

## The corpus

Frozen HTML in `fixtures/<platform>/<slug>.html`, ground truth in `expected/<slug>.json`.

Frozen rather than live because a benchmark whose inputs change underneath it cannot attribute
a score change to a code change — and because re-fetching real people's profile pages on every
run, forever, is not a thing to do casually. The cost is staleness, which is a maintenance
task rather than a design flaw.

### Adding a case

```bash
npm run benchmark -- --snapshot https://example.com/someone --as personal/someone
```

Then write `expected/someone.json` by reading the page **as a person would**.

Do not generate it from extractor output and correct the mistakes. That anchors ground truth
to today's behaviour and quietly converts the benchmark into a regression test — it will then
happily confirm that the extractor still does exactly what it did, including the parts it does
wrong.

Each case carries a `note` saying what it tests and `traits` naming the conditions it
exercises. `tests/benchmark.test.js` asserts the corpus still covers the traits that decide
the architecture, so the corpus cannot quietly lose its hard cases.

### What the current corpus covers

| Case | What it tests |
| --- | --- |
| `jsonld-complete` | The ceiling — a page that declares itself fully in JSON-LD |
| `microdata-hcard` | The same vocabulary in markup, with an entity-encoded name |
| `semantic-only` | Headings and lists, no structured data. The modal personal site |
| `publication-list` | Academic page; prose citations; publications vs projects |
| `org-variants` | One employer written three ways across two signals |
| `og-only` | A page with no person on it. Punishes invention |
| `spa-shell` | Client-rendered. The case a static fetcher structurally cannot handle |

## Providers

`providers.js` lists what is under test. Only `extract` is exercised — fetching is replaced by
the frozen fixture, so every provider sees identical bytes and a score difference is a
difference in extraction rather than in network luck.

A provider whose value *is* its fetching (a headless renderer) therefore needs its fixtures
captured post-render. That is the comparison worth making, and `--snapshot` writes whatever
that provider's own fetch returned.

## The rule extraction does not get to break

Extraction produces **claims**, never a profile.

```
Scraper → raw extraction → normalized → claims → evidence → resolver → canonical profile
```

Every extracted value carries a named confidence tier and loses to what the person said about
themselves. A provider that reads `"2022 – Present"` as ending in 2022 produces a claim that
surfaces as a conflict — not a silent rewrite of someone's employment history. This is
enforced structurally: `normalizeSignals` returns a fragment plus evidence, and `claims.js` is
the only path into the canonical profile.

## Reading the results

The first run of this corpus scored 69% recall and 77% precision, and the misses were more
useful than the score:

- List items were being collapsed, fusing a company name into the sentence after it.
- `&oslash;` was undecoded, so a Danish name came out mangled.
- "PhD X, University of Y" was filed with the degree as the institution.
- An unrecognised `<h2>Links</h2>` poured its contents into the education section above it.
- `"Jun 2021 – Present"` lost the "Present", leaving a current role with no end and no flag.

All five were real bugs in shared code — the last three in the résumé reader, where they had
been affecting PDF and DOCX imports too. That is the benchmark paying for itself before a
single provider was evaluated.
