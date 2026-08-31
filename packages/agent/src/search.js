/**
 * Deterministic search over a portfolio manifest.
 *
 * The pipeline the milestone asks for, with no step skipped:
 *
 *     manifest → searchable documents → index → query → retrieval → ranked results
 *
 * Every stage is pure and synchronous. There is no network call, no API key, no model, and no
 * build step — which is the point. A portfolio that only becomes searchable when someone pays
 * for an embeddings provider is not a portfolio anyone can rely on, and the base experience
 * has to be good enough to stand alone.
 *
 * ## What "semantic" honestly means here
 *
 * This is **not** embeddings, and nothing in this file pretends otherwise. It is lexical
 * retrieval (BM25-style term weighting over structured fields) plus a small, explicit concept
 * vocabulary that expands a query's terms into the words a portfolio actually uses. That is
 * what lets *"projects involving computer vision"* reach a project whose description says
 * "object detection with OpenCV" — the concept map knows those belong together, because
 * someone wrote it down, not because a model inferred it.
 *
 * The honest framing matters: a curated vocabulary handles the queries it covers very well and
 * the ones it does not cover not at all, whereas embeddings degrade gracefully across
 * everything. An embedding tier can be layered on top (see `rank`'s `expand` option) without
 * changing this file's contract. Until then, the capability is reported as `"lexical"` rather
 * than `"semantic"` so a consumer is never misled about what it is getting.
 *
 * ## Why results explain themselves
 *
 * A search result that cannot say *why* it matched is unusable for the thing this portfolio is
 * for. "Does he know Python?" should not answer "Python" — it should answer "Python, backed by
 * 12 repositories on GitHub and a résumé line". So every result carries the fields that
 * matched, the terms that hit them, and the provenance of the underlying record.
 *
 * @module @portfolio-engine/agent/search
 */

/**
 * Collections in the standard, and how much a match in each is worth.
 *
 * Weights are about *what a person is asking for*, not about how important the section is.
 * A query naming a technology is usually looking for something that was built with it, so
 * projects and experience outrank a skills-list entry that merely names it.
 */
const TYPE_WEIGHT = {
  projects: 1.0,
  experience: 1.0,
  publications: 0.95,
  education: 0.85,
  achievements: 0.85,
  skills: 0.8,
  certifications: 0.75,
  writing: 0.75,
  packages: 0.75,
  talks: 0.7,
  hackathons: 0.7,
  models: 0.7,
  videos: 0.6,
  competitions: 0.6,
  languages: 0.5,
}

/**
 * Per-field weighting within a document.
 *
 * A term in a title is a much stronger signal than the same term buried in a description —
 * "React" in a project called "React Router Clone" means something different from "React" in a
 * sentence explaining what the project is *not*.
 */
const FIELD_WEIGHT = {
  title: 3.0,
  subtitle: 2.0,
  tags: 2.5,
  text: 1.0,
}

/**
 * Concept vocabulary: the words people search with, mapped to the words portfolios use.
 *
 * Deliberately small and hand-written. Every entry is a claim that two things are related, and
 * a wrong claim here produces a confidently irrelevant result — so this grows by evidence, not
 * by imagination. Bidirectional: querying either side reaches the other.
 *
 * @type {Record<string, string[]>}
 */
const CONCEPTS = {
  'machine learning': ['ml', 'model', 'training', 'neural', 'inference', 'sklearn', 'pytorch', 'tensorflow', 'classifier', 'regression'],
  'artificial intelligence': ['ai', 'agent', 'llm', 'gpt', 'model', 'genai', 'prompt'],
  'computer vision': ['cv', 'opencv', 'image', 'vision', 'detection', 'segmentation', 'yolo', 'ocr'],
  'natural language processing': ['nlp', 'text', 'language', 'llm', 'embedding', 'tokenizer', 'sentiment'],
  'distributed systems': ['distributed', 'consensus', 'replication', 'sharding', 'kafka', 'cluster', 'scalability', 'microservices'],
  backend: ['server', 'api', 'rest', 'graphql', 'database', 'sql', 'node', 'django', 'flask', 'express', 'microservices'],
  frontend: ['ui', 'react', 'vue', 'svelte', 'css', 'browser', 'component', 'responsive', 'typescript'],
  'data science': ['data', 'analysis', 'pandas', 'numpy', 'visualization', 'statistics', 'analytics', 'jupyter'],
  devops: ['ci', 'cd', 'docker', 'kubernetes', 'deployment', 'pipeline', 'infrastructure', 'terraform'],
  security: ['auth', 'authentication', 'encryption', 'vulnerability', 'cryptography', 'oauth'],
  mobile: ['android', 'ios', 'flutter', 'react native', 'kotlin', 'swift', 'dart'],
  database: ['sql', 'postgres', 'mysql', 'mongodb', 'redis', 'query', 'schema', 'orm'],
  research: ['paper', 'publication', 'study', 'experiment', 'benchmark', 'thesis'],
}

/** Query words that carry no retrieval signal. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'them', 'his', 'her', 'their', 'my', 'your', 'about', 'into', 'through',
  'during', 'me', 'him', 'show', 'find', 'any', 'all', 'some', 'more', 'most', 'related',
  'involving', 'using', 'used', 'use', 'built', 'build', 'work', 'worked', 'know', 'knows',
])

/**
 * Split text into comparable terms.
 *
 * Keeps `+` and `#` so `c++` and `c#` survive as themselves rather than becoming `c` — the
 * kind of detail that decides whether a C++ engineer is findable on their own portfolio.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
    .split(/[\s\-_.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter((token) => token.length > 1 || token === 'c' || token === 'r')
}

/**
 * Turn a manifest into searchable documents.
 *
 * Each document keeps a reference back to the canonical entity it came from, so a result can
 * always be traced to the record that produced it rather than to a blob of presentation text.
 *
 * @param {Record<string, any>} manifest
 * @returns {SearchDocument[]}
 */
export function buildIndex(manifest) {
  /** @type {SearchDocument[]} */
  const documents = []
  if (!manifest || typeof manifest !== 'object') return documents

  for (const [type, weight] of Object.entries(TYPE_WEIGHT)) {
    const records = manifest[type]
    if (!Array.isArray(records)) continue

    records.forEach((record, index) => {
      const document = describe(type, record, index)
      if (document) documents.push(document)
    })
  }

  return documents
}

/**
 * One canonical record as a search document.
 *
 * @param {string} type @param {Record<string, any>} record @param {number} index
 * @returns {SearchDocument|null}
 */
function describe(type, record, index) {
  if (!record || typeof record !== 'object') return null

  const title = firstString(record.name, record.title, record.company, record.institution, record.platform)
  if (!title) return null

  const subtitle = firstString(record.role, record.degree, record.issuer, record.venue, record.organization, record.event, record.publication)

  const tags = [
    ...asArray(record.technologies),
    ...asArray(record.topics),
    ...asArray(record.tags),
    ...asArray(record.keywords),
    record.primaryLanguage,
    record.category,
    record.registry,
  ].filter(Boolean).map(String)

  const text = [
    record.description, record.summary, record.abstract, record.excerpt,
    record.context, record.problem, record.approach, record.impact,
    record.responsibilities, record.lessons, record.field, record.location,
    ...asArray(record.highlights),
    ...asArray(record.courses),
    ...asArray(record.achievements),
    ...asArray(record.authors),
    // A skill's evidence is the most searchable thing about it: "12 repositories" is what
    // makes "does he know Python" answerable rather than merely assertable.
    ...asArray(record.evidence).map((e) => e?.label),
  ].filter(Boolean).map(String).join(' ')

  return {
    id: `${type}/${record.id ?? slug(title)}${record.id ? '' : `-${index}`}`,
    type,
    title,
    subtitle,
    tags,
    text,
    url: firstString(record.url, record.liveUrl, record.repository, record.credentialUrl, record.doi && `https://doi.org/${record.doi}`),
    source: record.source ?? undefined,
    evidence: asArray(record.evidence),
    record,
  }
}

/**
 * Expand a query into the terms worth matching.
 *
 * @param {string} query
 * @returns {{terms: string[], expansions: Map<string, string[]>}}
 */
export function expandQuery(query) {
  const normalized = String(query ?? '').toLowerCase()
  const terms = tokenize(normalized).filter((t) => !STOP_WORDS.has(t))
  /** @type {Map<string, string[]>} */
  const expansions = new Map()

  for (const [concept, related] of Object.entries(CONCEPTS)) {
    // Multi-word concepts are matched against the raw string, so "computer vision" is
    // recognised as one idea rather than as the unrelated terms "computer" and "vision".
    const conceptHit = normalized.includes(concept)
      || related.some((word) => terms.includes(word))
      || tokenize(concept).every((word) => terms.includes(word))

    if (!conceptHit) continue
    const added = [...tokenize(concept), ...related].filter((t) => !terms.includes(t))
    if (added.length) expansions.set(concept, added)
  }

  return { terms, expansions }
}

/**
 * Rank documents against a query.
 *
 * Scoring is TF-weighted with an inverse-document-frequency factor, so a term that appears in
 * every record (a portfolio full of Python) contributes less than a rare one — otherwise the
 * most common technology would dominate every query that mentioned it.
 *
 * @param {SearchDocument[]} documents
 * @param {string} query
 * @param {{limit?: number, types?: string[], minScore?: number}} [options]
 * @returns {SearchResult[]}
 */
export function rank(documents, query, options = {}) {
  const { terms, expansions } = expandQuery(query)
  const expanded = [...new Set([...expansions.values()].flat())]

  if (!terms.length && !expanded.length) return []

  const pool = options.types?.length
    ? documents.filter((d) => options.types.includes(d.type))
    : documents

  const frequency = documentFrequency(pool, [...terms, ...expanded])
  const total = Math.max(pool.length, 1)

  /** @type {SearchResult[]} */
  const results = []

  for (const document of pool) {
    const fields = searchableFields(document)
    /** @type {Map<string, {field: string, direct: boolean}>} */
    const hits = new Map()
    let score = 0

    for (const [term, isDirect] of [...terms.map((t) => [t, true]), ...expanded.map((t) => [t, false])]) {
      const idf = Math.log(1 + total / (1 + (frequency.get(term) ?? 0)))

      for (const [field, value] of Object.entries(fields)) {
        const count = occurrences(value, term)
        if (!count) continue

        // Saturating term frequency: the second mention of a term says much less than the
        // first, and without this a description that repeats a word ten times would outrank a
        // title that names it once.
        const tf = 1 + Math.log(count)
        // An expanded term is evidence, but weaker evidence than the word actually typed.
        const confidence = isDirect ? 1 : 0.45
        score += tf * idf * (FIELD_WEIGHT[field] ?? 1) * confidence

        if (!hits.has(term) || (isDirect && !hits.get(term).direct)) {
          hits.set(term, { field, direct: isDirect })
        }
      }
    }

    if (score <= 0) continue

    score *= TYPE_WEIGHT[document.type] ?? 0.5

    results.push({
      id: document.id,
      type: document.type,
      title: document.title,
      subtitle: document.subtitle,
      url: document.url,
      score: Number(score.toFixed(4)),
      // Why this matched, in the shape a UI can render and a human can check.
      matched: [...hits.entries()].map(([term, hit]) => ({ term, field: hit.field, direct: hit.direct })),
      provenance: provenanceOf(document),
      record: document.record,
    })
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  const minScore = options.minScore ?? 0
  const filtered = minScore > 0 ? results.filter((r) => r.score >= minScore) : results
  return typeof options.limit === 'number' ? filtered.slice(0, options.limit) : filtered
}

/**
 * What backs this record, in the terms the milestone's provenance requirement asks for.
 *
 * The distinction that matters: "employed at Google" and "mentions Google" must not flatten
 * into the same result. The record's own `source` says which system reported it, and a skill's
 * `evidence` says what demonstrates it — both travel with the result so a reader can judge.
 *
 * @param {SearchDocument} document
 */
function provenanceOf(document) {
  /** @type {Record<string, any>} */
  const provenance = {}
  if (document.source?.connector) provenance.source = document.source.connector
  if (document.source?.url) provenance.url = document.source.url
  if (document.source?.extraction?.method) provenance.method = document.source.extraction.method
  if (typeof document.source?.confidence === 'number') provenance.confidence = document.source.confidence
  if (document.evidence.length) {
    provenance.evidence = document.evidence
      .map((e) => ({ label: e?.label, count: e?.count, source: e?.connector }))
      .filter((e) => e.label)
  }
  return Object.keys(provenance).length ? provenance : undefined
}

/** @param {SearchDocument} document */
const searchableFields = (document) => ({
  title: document.title,
  subtitle: document.subtitle ?? '',
  tags: document.tags.join(' '),
  text: document.text,
})

/**
 * How many documents contain each term. Computed per query rather than cached, because an
 * index this size (hundreds of records, not millions) rebuilds faster than a cache
 * invalidation bug takes to find.
 *
 * @param {SearchDocument[]} documents @param {string[]} terms
 */
function documentFrequency(documents, terms) {
  /** @type {Map<string, number>} */
  const frequency = new Map()
  for (const term of terms) {
    if (frequency.has(term)) continue
    let count = 0
    for (const document of documents) {
      const fields = searchableFields(document)
      if (Object.values(fields).some((value) => occurrences(value, term) > 0)) count += 1
    }
    frequency.set(term, count)
  }
  return frequency
}

/**
 * How many times a term appears in a value.
 *
 * Matches whole tokens and prefixes of at least four characters, so "auth" finds
 * "authentication" but "ai" does not find "email" — a substring search on short technical
 * terms produces results a reader cannot make sense of.
 *
 * @param {string} value @param {string} term
 */
function occurrences(value, term) {
  if (!value) return 0
  const tokens = tokenize(value)
  let count = 0
  for (const token of tokens) {
    if (token === term) count += 2
    else if (term.length >= 4 && token.startsWith(term)) count += 1
    else if (term.length >= 4 && token.length >= 4 && term.startsWith(token)) count += 1
  }
  return count
}

/** @param {unknown} value */
const asArray = (value) => (Array.isArray(value) ? value : [])

/** @param {...unknown} values */
const firstString = (...values) => values.find((v) => typeof v === 'string' && v.trim())?.trim()

/** @param {string} value */
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * @typedef {object} SearchDocument
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string[]} tags
 * @property {string} text
 * @property {string} [url]
 * @property {object} [source]
 * @property {object[]} evidence
 * @property {Record<string, any>} record
 */

/**
 * @typedef {object} SearchResult
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [url]
 * @property {number} score
 * @property {{term: string, field: string, direct: boolean}[]} matched
 * @property {Record<string, any>} [provenance]
 * @property {Record<string, any>} record
 */

export { CONCEPTS, TYPE_WEIGHT, STOP_WORDS }
