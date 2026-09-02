# Search

Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> and ask a question. The answer comes from the
portfolio's own data — the same records the page renders and the same manifest agents read —
ranked by four signals that each know something the others do not.

There is no API key, no account, and no per-query cost. After the first query the model is in
your browser cache and the whole thing works offline.

## Why a pretrained model

The previous milestone shipped three retrieval signals derived from the corpus itself: exact
terms with stemming, a hand-authored concept map, and distributional association learned from
which words co-occur across records. Together they handle a lot. They cannot handle this:

> **recognizing things from images**

The corpus has about 800 distinct terms across 120 records. `recognizing`, `recognition`,
`image`, `images` and `vision` are all absent from it. The record that answers the question —
"FACE EMOTION DETECTION" — has no description at all: a title and the tag `Python`. No method
that learns only from this corpus can connect that question to that record, because the
connection is not in the corpus. It is in the language.

That is what a pretrained embedding model supplies, and it is the only thing it is used for.

## The model

**`Xenova/all-MiniLM-L6-v2`**, int8-quantized, 384 dimensions, Apache-2.0.

Chosen by measurement rather than reputation. What was measured, and what it came back as:

| | |
| --- | --- |
| Semantic recall (paraphrases) | 6/7, against 5/7 lexical |
| Open-vocabulary recall | 10/12, against 9/12 lexical |
| False positives | 0/3 |
| Query latency, warm (Node) | median 15.5 ms, p95 32.5 ms |
| Query latency, warm (browser) | median 71 ms, p95 278 ms |
| Bundle impact on the page | **0 bytes** — nothing model-related is fetched on load |
| Licence | Apache-2.0 |
| Offline after first load | yes |

### What the first search actually downloads

Worth stating plainly, because it is larger than the model alone and it is easy to quote only
the flattering half:

| | Transferred | From |
| --- | --- | --- |
| ONNX runtime WebAssembly | 5.75 MB gzipped (23.6 MB raw) | your own site |
| Model weights, int8 | 21.9 MB | huggingface.co |
| transformers.js | 157 kB gzipped | your own site |
| **First search, total** | **~27.8 MB** | |
| Every search after that | 0 | browser cache |

None of it is fetched until someone actually searches — measured on the production build, the
first paint requests five JavaScript chunks totalling 200 kB and none of them is any of the
above. A visitor who never opens the search box downloads none of it, and one who does pays
once per browser.

That is the honest trade: a large one-time cost, in exchange for no API key, no account, no
per-query fee, and search that keeps working offline and after the project is abandoned. If
that trade is wrong for your portfolio, `npm run embed` is optional — skip it and the site
ships with lexical search and none of the above.

The measurement that shaped the design was this one: across the real corpus, positive
pairs scored 0.31–0.48 and negatives 0.02–0.20 — but one true positive scored **0.06**, below a
negative at **0.20**. Pure vector search would have ranked a wrong answer above a right one. So
the model is a signal, not the ranking.

## Hybrid ranking

Four signals, combined with weights declared in one exported table
(`WEIGHTS` in `packages/agent/src/search.js`) rather than scattered as literals through the
scoring loop:

| Signal | What it knows |
| --- | --- |
| Exact terms | the word is actually in the record |
| Concept expansion | "computer vision" and "object detection" are the same field |
| Distributional | in *this* corpus, these words travel together |
| Embeddings | in English generally, these sentences mean the same thing |

The embedding contribution is **additive but floored and capped**: below a similarity of 0.22 it
does not register at all, and its maximum weight cannot let it outrank a direct lexical hit.
Additive rather than multiplicative so that a record with no lexical footprint at all can still
surface; floored so that the long tail of weak cosine noise cannot reorder the list.

### Sections boost, they never filter

A question that names a section — "**work** involving computer vision" — has that section
preferred, not enforced. If the words directly hit a record elsewhere, that record leads and the
section is listed after it. If nothing was directly matched, the section leads and the inferred
matches follow. Which half leads is decided by whether any match is `direct` — a property the
matcher already computes — rather than by another tunable number.

## Similarity is retrieval, never evidence

This is the boundary the whole feature is built around.

A cosine says two pieces of text are similar. It does not say the portfolio *claims* anything.
So a semantically-surfaced result:

- gains no provenance it did not already have;
- never appears in `matched`, which is a list of terms that actually occurred — a cosine is not
  a term, and listing it as one would be similarity dressed as evidence;
- reports its score as a separate `similarity` number, so a reader can see the difference
  between "this word is in the record" and "this reads like your question".

Four tests in `packages/agent/test/embedding.test.js` exist solely to hold this line.

## Degradation

Every failure mode ends in lexical search, silently:

| What breaks | What the visitor sees |
| --- | --- |
| Built without `npm run embed` | lexical results; the manifest reports `lexical+concept+distributional` |
| Model CDN unreachable | lexical results, no error |
| Old browser, no WebAssembly | lexical results, no error |
| Malformed embedding index | ignored; lexical results |
| Offline after first load | full semantic search, from cache |

Nothing tells the visitor that anything is missing, because from their side nothing is. Lexical
results render on the same frame as the keystroke, and the semantic list replaces them in place
if and when it arrives — guarded so a slow promise can never overwrite results for a query the
user has already moved on from.

## Optional remote providers

The local model is the default and needs nothing. If you would rather call a hosted embedding
API, three adapters are included — OpenRouter, Groq, and any OpenAI-compatible endpoint:

```js
import { openRouterProvider } from '@portfolio-engine/agent'

await portfolio.semanticSearch('computer vision', {
  provider: openRouterProvider(process.env.OPENROUTER_API_KEY),
})
```

They are one class behind three factory functions, because the difference between them is a base
URL. Nothing in the project requires them, nothing degrades without them, and a portfolio built
by someone with no AI account is not a portfolio with a worse search box.

## Rebuilding the index

```bash
npm run embed
```

Reads the built profile, embeds every document in about two seconds, and writes
`src/data/generated/embeddings.json` — 65 kB for 122 documents, int8-quantized to a quarter of
float32 and base64-packed.

That file is **generated output and is not committed**, so a fresh clone does not have it. The
build copes: the index is read through `import.meta.glob`, which yields nothing rather than
failing to resolve, and the manifest then reports `lexical+concept+distributional` instead of
claiming a capability the site does not have.

CI generates it on every deploy, and the workflow's verify step reads that manifest field and
**fails the run** if it is not `hybrid-semantic`. A model CDN outage therefore leaves the
previous deployment — with its working search — in place, rather than quietly replacing it with
a lexical-only site.

## Benchmarking it yourself

```bash
npm run benchmark:semantic
```

Twelve open-vocabulary cases, seven paraphrases, three negatives, five gates, run against the
real corpus and compared with the lexical baseline. It also checks its own premise — it reports
how many "out-of-vocabulary" cases use words that are in fact present, which on this corpus is
three of twelve, so only nine are genuinely OOV. A benchmark that cannot fail its own assumptions
is not measuring anything.
