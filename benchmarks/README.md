# The extraction benchmark

> Given a public professional profile URL, how accurately can we turn the page into canonical
> portfolio claims?

That is the question this directory answers. Not "which scraper is best" — scraping is a
means. What matters is how much of a person's professional identity survives the trip from a
web page to the claims the resolver publishes, and how much of what arrives is *right*.

```bash
npm run benchmark                        # every provider, summary tables
npm run benchmark -- --detail            # per-case scores
npm run benchmark -- --misses            # every field missed, wrong, or invented
npm run benchmark -- --case <slug>       # one page
npm run benchmark -- --provider builtin  # one provider
npm run benchmark -- --concurrency 8     # pages in flight (rendering providers)
npm run benchmark -- --json              # machine-readable, for tracking over time
```

Fixtures are served from `127.0.0.1` for the duration of a run, so a rendering provider gets
a real URL, a real status code and real script execution — without the benchmark ever leaving
the machine. `npm test` reaches no network and starts no browser it cannot find.

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
| **Validity** | Does that evidence actually *support* the value? |
| **Traps** | Did a passing mention get turned into a claim? |
| **JS pages** | How much was recovered from client-rendered pages? |
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

### Evidence validity

Measuring whether evidence *exists* is not enough. This system's product is professional
claims backed by evidence, so the evidence has to hold up:

```
Company = Google   ←  "Software Engineer at Google"        supported
Company = Google   ←  "Follows Google on LinkedIn"         not supported
Company = Google   ←  "Rebuilt the settlement pipeline"    not supported
```

Validity checks two things deterministically: **containment** (does the recorded span
actually contain the value?) and **licensing** (did the span come from a section that can
support this kind of claim — "Experience", not "Following"?). Values from structured data
pass by construction; the page declared them in a typed field, and the declaration *is* the
evidence.

What it cannot do is judge meaning. *"Worked with Google's API"* sits under Experience and
contains "Google", and this will accept it. Catching that needs a model that reads the
sentence — a Tier 3 question. This is the deterministic floor beneath it, and it is worth
having precisely because it is cheap enough to run on every commit.

### The gate

```
precision ≥ 97%   ·   evidence ≥ 95%   ·   validity ≥ 95%   ·   traps = 100%
```

A provider that fails any of these does not get compared on recall, cost or latency. The
ordering is deliberate: **inventing someone's experience is worse than missing a field they
can add by hand.** Recall is an inconvenience budget; precision and traps are a trust budget,
and the second does not refill.

## The corpus

Frozen HTML in `fixtures/<platform>/<slug>.html`, ground truth in `expected/<slug>.json`.

Frozen rather than live because a benchmark whose inputs change underneath it cannot attribute
a score change to a code change — and because re-fetching real people's profile pages on every
run, forever, is not a thing to do casually. The cost is staleness, which is a maintenance
task rather than a design flaw.

### Adding a case

```bash
npm run benchmark -- --snapshot https://example.com/someone --as personal/someone
npm run benchmark -- --snapshot https://example.com/someone --as personal/someone --render
```

`--render` captures what Chromium produced rather than what the server sent, which is the only
way to freeze a client-rendered page usefully. `--screenshot` writes an image beside it for
debugging a capture that looks wrong. Either way a `.capture.json` sidecar records the final
URL, status, title, JSON-LD block count, byte size and timings — so a stale fixture can later
be told apart from a broken extractor.

Capture is explicit and manual. It requires a URL, never runs during `npm test`, and no
ordinary benchmark run reaches the internet. Captured pages are **not** committed
automatically: a real person's profile becoming a permanent fixture in a public repository is
a decision, not a side effect.

Then write `expected/someone.json` by reading the page **as a person would**.

Do not generate it from extractor output and correct the mistakes. That anchors ground truth
to today's behaviour and quietly converts the benchmark into a regression test — it will then
happily confirm that the extractor still does exactly what it did, including the parts it does
wrong.

Each case carries a `note` saying what it tests and `traits` naming the conditions it
exercises. `tests/benchmark.test.js` asserts the corpus still covers the traits that decide
the architecture, so the corpus cannot quietly lose its hard cases.

### Negative examples

A fixture may declare `forbidden` — conclusions that must **not** be drawn:

```json
"forbidden": {
  "experience": [{ "company": "Google" }, { "role": "Engineer" }],
  "skills": [{ "name": "Python" }]
}
```

These are scored as their own metric because neither recall nor accuracy can see them: an
invented value has no expected counterpart to be wrong about, so it is invisible to accuracy,
and recall actively *rewards* producing it. Stating only `{"company": "Google"}` bans that
employer however the rest of the record came out.

This is where extraction systems become dangerous. A page that mentions Google in a footer,
Python in an article about migrating away from Python, or Cambridge in a co-author's
affiliation will produce a plausible, confident, entirely fabricated CV — and the person it
describes is the last to find out.

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
| `footer-mentions` | Credits, a nav item reading "Engineer", icon-only social links |
| `article-mentions` | An article naming a dozen technologies the author does not claim |
| `other-affiliations` | Co-authors' institutions, and journals reviewed for |
| `client-logos` | Companies worked *with*, not *at* |
| `hydrated-profile` | A whole profile rendered client-side. Nothing in the served HTML |
| `deferred-projects` | Half the project list arrives after a timer |
| `injected-jsonld` | Structured data written by the client, and a non-ASCII name |
| `rendered-trap` | Widgets that appear only after render, and must not become claims |

### What it still needs

Eleven cases validate the framework. Deciding between providers needs 30–50, and the gaps
are known:

- **Platform patterns** — GitHub-like, LinkedIn-like, Scholar-like, Devpost-like. These
  should be **captured, not invented**: a hand-authored "GitHub-like" fixture tests an
  author's memory of GitHub's markup, which is exactly the thing that has no bearing on how
  extraction performs against the real page. Use `--snapshot`.
- **Documents** — clean PDF, scanned PDF, DOCX, multi-column résumé. A different input path
  from HTML, and the corpus loader would need to route non-HTML fixtures through
  `ingestDocument`. Scanned PDF has no OCR behind it today, so that case would measure a
  known zero.
- **Structural hard cases** — deeply nested DOM, unusual typography, incomplete profiles.

## Providers

`src/core/extraction/providers/` holds them; importing its index registers them in escalation
order, cheapest first.

| Provider | What it does |
| --- | --- |
| `builtin` | One HTTP GET and a parser. No browser, no service, no key. |
| `playwright` | Renders in Chromium, then hands the DOM to **the same extractor**. |

That last point is the design of the experiment. The Playwright provider does no parsing of
its own — `structuredExtraction: false` — so any score difference between the two is
attributable to rendering and to nothing else. A provider that rendered *and* parsed
differently would make the comparison unreadable: a moved number could come from either half.

Providers declaring `capabilities.javascript` are given a real URL from the local fixture
server; the rest are handed the fixture bytes. Both see the same page, and both normalize
against the fixture's canonical URL rather than the localhost address that served it — so
relative links resolve where they really point.

### Extraction is the fallback branch

```
URL
 ├── a platform a connector already knows  →  the connector. Always.
 └── anything else                         →  cheapest capable provider, escalating
```

`registry.js` states this once. Thirty connectors already know what to ask GitHub and ORCID
for, and routing those through a browser would be slower, more fragile and less accurate than
the API call it replaces. Having a browser must not turn into using it for everything.

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

## Where the providers stand

15 cases, 28 forbidden conclusions, one shared extractor.

```
                Recall  Accuracy  Precision  Structure  Entities  Dates
Built-in           78%       99%        98%       100%      76%    79%
Playwright         91%      100%        99%       100%      88%    89%

              Evidence  Validity  Traps  Invented  JS pages  Median    p95
Built-in          100%       99%   100%        1%       32%     2ms   16ms
Playwright        100%       99%   100%        1%       83%   401ms  570ms
```

Both pass the gate. Rendering buys **+13 points of recall** and costs **roughly 200× the
latency** — 2 ms against ~400 ms per page, plus a one-time ~90 ms browser start. The render
wait itself is ~255 ms of that; the rest is context setup, navigation and content capture.

Measured over the whole corpus at concurrency 4: 1.6 s wall against under 0.1 s. Figures are
from `chrome-headless-shell`; the full browser's own headless mode, which the provider falls
back to when the shell is not installed, is about 60% slower per page and identical in every
quality metric — the same engine renders the page either way.

Two results are worth more than the headline:

**Traps hold at 100% through rendering.** This was not a given. A browser returns *more*
information, which is also more opportunity to conclude something false — `rendered-trap`
grows an integrations widget and a "people also viewed" rail that a static fetch never sees.
The extractor declines both. Precision actually rose (98% → 99%), because the extra recall
came from real content rather than from guessing harder.

**The two zeros on `spa-shell` mean different things.** The static provider cannot run
scripts; the browser has no script to run, because the fixture's bundle was never captured
with it. A frozen snapshot of a single-page app is only as good as the assets frozen
alongside it — which is what `--snapshot --render` exists for.

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

Adding evidence validity found three more, all of the same shape: evidence that was *present*
but did not show what it claimed to. A description backed by the job title line above it. A
social URL backed by the words "GitHub". A paper's title backed by its author list. Every one
of those reads as provenance while providing none — and unlike a missing span, it cannot be
told apart from evidence that holds up. They are fixed; per-attribute spans are why validity
is 99% rather than 92%.

Adding the browser found three more, and the first is the best bug this corpus has produced:

- **`İ`.toLowerCase() is two characters.** The parser located a `<script>`'s closing tag by
  searching a lower-cased copy of the document, then sliced the *original* at that index.
  Turkish dotted capital İ folds to `i` plus a combining dot, so every index after it shifted
  by one — and a page whose subject lived in İzmir silently lost its entire JSON-LD payload to
  a stray `<`. Case folding is not length-preserving, and indices from a folded copy do not
  belong to the original. Now searched with a case-insensitive regex on the original string.
- **`looksLikeName` was ASCII-only.** `[A-Z][\w'’.-]*` rejects Yıldırım, Sørensen, Nyström and
  Đorđević, so the reader skipped the real name and took the next line — usually a job title.
  A name matcher that only recognises ASCII names does not fail politely; it confidently
  misidentifies people. Now Unicode-aware.
- **Sibling paragraphs were being fused.** A header's `<p>headline</p><p>location</p>` became
  one string, so a headline came out as "Site Reliability Engineer Casablanca, Morocco".

The first two were latent in the static path too. Rendering did not introduce them — it
produced the pages that exposed them.
