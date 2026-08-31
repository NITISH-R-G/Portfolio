# @portfolio-engine/agent

Read anyone's portfolio programmatically — entities, search, provenance, and LLM-ready
context — from a published manifest rather than by scraping a page.

```bash
npm install @portfolio-engine/agent
```

```js
import { PortfolioAgent } from '@portfolio-engine/agent'

const portfolio = await PortfolioAgent.fromUrl('https://example.com/portfolio/')

portfolio.person                              // { name, headline, summary, ... }
portfolio.getProjects()
portfolio.search('projects involving computer vision')
portfolio.findSkill('Python')                 // the skill *and* what demonstrates it
portfolio.toPrompt()                          // grounded context for any LLM
```

## Two guarantees

**No API key required.** Everything except `ask()` is deterministic, local and offline once
the manifest has loaded. Search is lexical retrieval with a concept vocabulary — not
embeddings, and this package never claims otherwise. A portfolio that is only searchable while
someone is paying an inference bill is not one you can build on.

**It works for any conforming portfolio.** There is no special-casing of hosts, people,
sections or fields. It reads the [portfolio standard](https://github.com/NITISH-R-G/Portfolio/blob/main/docs/standard.md)
and nothing else. The test suite runs against a deliberately unrelated fictional profile so
that an assumption about *whose* portfolio it is reading cannot pass unnoticed.

## How it finds a portfolio

Give it any URL — a page, a directory, or a manifest. Resolution order:

1. The URL is already a manifest (`…/portfolio.json`).
2. The page declares one: `<link rel="alternate" type="application/portfolio+json" href="…">`.
3. Convention: `portfolio.json` beside the page, then at the origin root.

HTML is fetched for exactly one reason — to read that `<link>` tag. Profile data is **never**
extracted from rendered markup, so this keeps working when a portfolio's visual design changes
completely.

## API

### Loading

```js
PortfolioAgent.fromUrl(url, { fetch?, timeoutMs? })   // → Promise<PortfolioAgent>
PortfolioAgent.fromManifest(manifest, { url?, strict? })
```

A manifest from a newer *minor* schema version loads with a note. A different *major* version
is refused — silently misreading a shape you do not understand produces confidently wrong
answers about a real person.

### Entities

```js
portfolio.person
portfolio.capabilities
portfolio.sections()                 // { projects: 12, experience: 4, ... }
portfolio.get('projects')
portfolio.getProjects() / getExperience() / getEducation() / getSkills()
portfolio.getPublications() / getAchievements() / getCertifications()
portfolio.entity('projects/some-slug')
```

### Search

```js
portfolio.search('what did they build with Rust?', { limit: 10, types: ['projects'] })
```

Every result explains itself:

```js
{
  id: 'projects/abyssal-nav',
  type: 'projects',
  title: 'abyssal-nav',
  score: 47.7,
  matched: [                                  // why it matched
    { term: 'navigation', field: 'text',  direct: true  },
    { term: 'slam',       field: 'tags',  direct: false } // ← concept expansion
  ],
  provenance: {                               // and what backs it
    source: 'github',
    url: 'https://github.com/…',
    evidence: [{ label: '18 repositories', count: 18, source: 'github' }]
  },
  record: { /* the canonical entity */ }
}
```

`direct: false` marks a term that came from concept expansion rather than the query — so a UI
can distinguish "you asked for this" from "we think this is related".

### Provenance

```js
portfolio.findSkill('Python')
// { skill, evidence: [{ label: '9 repositories', … }], usedIn: [{ type, title }, …] }

portfolio.getEvidence('experience/acme-engineer')
// { source: 'linkedin', url, confidence, extraction, evidence }
```

"Does she know C++?" is answerable with what demonstrates it, not by repeating the word back.
Relationships are not flattened: employment, collaboration and a passing mention stay
distinguishable, because the underlying records keep their own provenance.

### Export

```js
portfolio.toMarkdown()                                  // whole profile
portfolio.toMarkdown({ entity: 'projects/abyssal-nav' })
portfolio.toPrompt({ question: 'What demonstrates backend work?' })
```

`toPrompt()` emits grounding instructions before any data: use only what follows, say so when
unsupported, cite evidence, and do not infer seniority from a technology list. That preamble
matters more than the data — a model handed a CV with no instructions answers questions the CV
never addressed, about a real person.

### Optional: model-backed answers

```js
await portfolio.ask('What has she built with C++?', {
  complete: async (prompt) => callYourModel(prompt),
})
// → { answer, prompt, grounding: SearchResult[] }
```

There is **no default provider, no bundled key, and no hosted endpoint**. You pass a function
that talks to a model you already pay for. `grounding` returns what deterministic search thinks
is relevant to the same question, so an answer can be displayed with its sources rather than
taken on faith.

## Errors

`PortfolioError` carries a `code` you can branch on: `not-found`, `bad-url`, `invalid`,
`no-provider`, `no-fetch`.

## Compatibility

Node 18+ and modern browsers. ESM only. No runtime dependencies. Pass `{ fetch }` if your
environment has no global.

## License

MIT
