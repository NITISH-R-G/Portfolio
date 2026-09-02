/**
 * `@portfolio-engine/agent` — read anyone's portfolio programmatically.
 *
 * ```js
 * const portfolio = await PortfolioAgent.fromUrl('https://example.com/portfolio/')
 * portfolio.search('projects involving computer vision')
 * portfolio.getProjects()
 * portfolio.toPrompt()
 * ```
 *
 * ## Two guarantees
 *
 * **It works without an API key.** Everything except `ask()` is deterministic, local and
 * synchronous once the manifest has loaded. A portfolio that is only searchable when someone
 * is paying an inference bill is not a portfolio a person can rely on.
 *
 * **It works for any conforming portfolio, not this one.** There is no special-casing of
 * fields, sections, hosts or people anywhere in this package. It reads the published standard
 * and nothing else — the tests run against a fictional profile precisely so that a
 * Nitish-shaped assumption cannot pass unnoticed.
 *
 * @module @portfolio-engine/agent
 */

import { discoverManifest, validateManifest, PortfolioError } from './manifest.js'
import { buildIndex, rank } from './search.js'
import { buildSemanticIndex } from './semantic.js'
import { LocalEmbeddingProvider, unpackVectors, cosine, EmbeddingUnavailable } from './embedding.js'
import { parseQuery, describeQuery } from './query.js'
import { manifestToMarkdown, entityToMarkdown, resultsToMarkdown } from './markdown.js'
import { manifestToPrompt, entityToPrompt, resultsToPrompt } from './prompt.js'

/**
 * A loaded portfolio.
 *
 * Construct with {@link PortfolioAgent.fromUrl} or {@link PortfolioAgent.fromManifest} rather
 * than `new` — the constructor takes an already-validated manifest and does no I/O.
 */
export class PortfolioAgent {
  /**
   * @param {Record<string, any>} manifest
   * @param {{url?: string, issues?: import('./manifest.js').Issue[]}} [context]
   */
  constructor(manifest, context = {}) {
    /** @type {Record<string, any>} */
    this.manifest = manifest
    /** Where it was loaded from, when known. */
    this.url = context.url ?? manifest?.url
    /** Non-fatal notes from loading and validation. */
    this.issues = context.issues ?? []

    // Built once. The index is derived data — rebuilding it per query would be wasted work,
    // and caching it across queries is safe because a manifest is immutable once loaded.
    this._index = buildIndex(manifest)
    // Derived from the corpus once, alongside the lexical index. Both are pure functions of an
    // immutable manifest, so caching them together is safe and rebuilding per query is waste.
    this._semantic = buildSemanticIndex(this._index)
  }

  /**
   * Load a portfolio from a URL — a page, a directory, or a manifest.
   *
   * @param {string} url
   * @param {import('./manifest.js').LoadOptions} [options]
   * @returns {Promise<PortfolioAgent>}
   */
  static async fromUrl(url, options = {}) {
    const { manifest, url: resolved, issues } = await discoverManifest(url, options)
    return new PortfolioAgent(manifest, { url: resolved, issues })
  }

  /**
   * Load from an already-fetched manifest.
   *
   * @param {unknown} manifest
   * @param {{url?: string, strict?: boolean}} [options]
   * @returns {PortfolioAgent}
   */
  static fromManifest(manifest, options = {}) {
    const { valid, issues } = validateManifest(manifest)
    if (!valid && options.strict !== false) {
      throw new PortfolioError(
        `Manifest is not usable: ${issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ')}`,
        'invalid',
        issues,
      )
    }
    return new PortfolioAgent(/** @type {Record<string, any>} */ (manifest), { url: options.url, issues })
  }

  /* Identity ---------------------------------------------------------------- */

  /** The person this portfolio describes. */
  get person() {
    return this.manifest.person ?? {}
  }

  /** What this portfolio declares it supports. */
  get capabilities() {
    return this.manifest.capabilities ?? {}
  }

  /* Entities ----------------------------------------------------------------- */

  /**
   * Records from one collection.
   *
   * @param {string} type
   * @returns {Record<string, any>[]}
   */
  get(type) {
    const value = this.manifest[type]
    return Array.isArray(value) ? value : []
  }

  getProjects() { return this.get('projects') }
  getExperience() { return this.get('experience') }
  getEducation() { return this.get('education') }
  getSkills() { return this.get('skills') }
  getPublications() { return this.get('publications') }
  getAchievements() { return this.get('achievements') }
  getCertifications() { return this.get('certifications') }

  /** Every collection that actually has records, with counts. */
  sections() {
    const out = {}
    for (const [key, value] of Object.entries(this.manifest)) {
      if (Array.isArray(value) && value.length) out[key] = value.length
    }
    return out
  }

  /**
   * One entity by its search id (`projects/some-slug`).
   *
   * @param {string} id
   * @returns {Record<string, any>|undefined}
   */
  entity(id) {
    return this._index.find((document) => document.id === id)?.record
  }

  /* Search ------------------------------------------------------------------- */

  /**
   * Search the portfolio.
   *
   * Deterministic and offline. Results carry the terms that matched and the provenance of the
   * record, so a caller can show *why* something matched rather than asking for trust.
   *
   * Accepts a natural-language question, not just keywords. "Where did he study?" and "What
   * companies has he worked with?" are understood as questions about a section of the
   * portfolio; see `query.js` for how, and for why the section is a preference rather than a
   * filter.
   *
   * @param {string} query
   * @param {{limit?: number, types?: string[], minScore?: number, parse?: boolean}} [options]
   * @returns {import('./search.js').SearchResult[]}
   */
  search(query, options = {}) {
    // `parse: false` opts back into pure lexical matching, for a caller that has already
    // narrowed the question and does not want it re-interpreted.
    const parsed = options.parse === false ? query : parseQuery(query)
    return rank(this._index, parsed, { semantic: this._semantic, ...options })
  }

  /**
   * Attach a precomputed embedding index.
   *
   * Built by `npm run embed` and shipped with the portfolio, so the runtime never embeds
   * documents — only the query.
   *
   * @param {{ids: string[], data: string, count: number, dimensions: number, scale: number, model?: string}} index
   */
  useEmbeddings(index) {
    if (!index?.data || !Array.isArray(index.ids)) return this
    const vectors = unpackVectors(index)
    this._vectors = new Map(index.ids.map((id, i) => [id, vectors[i]]).filter(([, v]) => v))
    this._embeddingModel = index.model
    return this
  }

  /**
   * Search, with the embedding model deciding what is *about* the same thing.
   *
   * Async because it may have to load a model. Degrades to `search()` — never throws and never
   * returns nothing — when embeddings are unavailable, which covers a portfolio built without
   * them, a browser that could not fetch the weights, and an offline first visit.
   *
   * @param {string} query
   * @param {{limit?: number, types?: string[], provider?: object}} [options]
   * @returns {Promise<import('./search.js').SearchResult[]>}
   */
  async semanticSearch(query, options = {}) {
    if (!query?.trim()) return []
    if (!this._vectors?.size) return this.search(query, options)

    let scores
    try {
      const provider = options.provider ?? this._provider ?? (this._provider = new LocalEmbeddingProvider())
      const [vector] = await provider.embed([query])
      if (!vector) throw new EmbeddingUnavailable('no vector')

      scores = new Map()
      for (const [id, documentVector] of this._vectors) {
        scores.set(id, cosine(vector, documentVector))
      }
    } catch {
      // The whole point of hybrid: losing the semantic signal costs recall, not search.
      return this.search(query, options)
    }

    return rank(this._index, parseQuery(query), {
      semantic: this._semantic, semanticScores: scores, ...options,
    })
  }

  /**
   * How a question was understood, without running it.
   *
   * Exposed so a consumer — a UI explaining itself, or an agent deciding whether to trust the
   * interpretation — can inspect the reading before acting on the results.
   *
   * @param {string} query
   * @returns {import('./query.js').ParsedQuery & {description?: string}}
   */
  understand(query) {
    const parsed = parseQuery(query)
    const description = describeQuery(parsed)
    return description ? { ...parsed, description } : parsed
  }

  /**
   * What backs a claim — the question "does he know X?" should be answerable with evidence
   * rather than with the word X repeated back.
   *
   * @param {string} name
   * @returns {{skill: Record<string, any>, evidence: object[], usedIn: {type: string, title: string}[]}|undefined}
   */
  findSkill(name) {
    const wanted = String(name ?? '').toLowerCase().trim()
    if (!wanted) return undefined

    const skill = this.getSkills().find((s) => String(s.name ?? '').toLowerCase() === wanted)
      ?? this.getSkills().find((s) => String(s.name ?? '').toLowerCase().includes(wanted))
    if (!skill) return undefined

    // Where it is actually demonstrated, which is a stronger answer than the skill entry.
    const usedIn = this._index
      .filter((document) => document.type !== 'skills'
        && document.tags.some((tag) => String(tag).toLowerCase() === String(skill.name).toLowerCase()))
      .map((document) => ({ type: document.type, title: document.title }))

    return { skill, evidence: skill.evidence ?? [], usedIn }
  }

  /**
   * Provenance for one entity.
   *
   * @param {string} id
   * @returns {Record<string, any>|undefined}
   */
  getEvidence(id) {
    const document = this._index.find((d) => d.id === id)
    if (!document) return undefined
    return {
      source: document.source?.connector,
      url: document.source?.url ?? document.url,
      confidence: document.source?.confidence,
      extraction: document.source?.extraction,
      evidence: document.evidence,
    }
  }

  /* Export ------------------------------------------------------------------- */

  /**
   * The whole profile, or one entity, as Markdown.
   *
   * @param {{entity?: string, sections?: string[]}} [options]
   * @returns {string}
   */
  toMarkdown(options = {}) {
    if (options.entity) {
      const record = this.entity(options.entity)
      return record ? entityToMarkdown(record) : ''
    }
    return manifestToMarkdown(this.manifest, { sections: options.sections })
  }

  /**
   * The whole profile, or one entity, as an LLM prompt with grounding instructions.
   *
   * @param {{entity?: string, question?: string, sections?: string[]}} [options]
   * @returns {string}
   */
  toPrompt(options = {}) {
    if (options.entity) {
      const document = this._index.find((d) => d.id === options.entity)
      if (!document) return ''
      return entityToPrompt(document.record, {
        type: document.type,
        person: this.person.name,
        source: this.url,
        question: options.question,
      })
    }
    return manifestToPrompt(this.manifest, { question: options.question, sections: options.sections })
  }

  /* Optional model-backed question answering ---------------------------------- */

  /**
   * Ask a question about the portfolio using a model **you** supply.
   *
   * There is deliberately no default provider, no bundled key, and no hosted endpoint. The
   * caller passes a function that talks to whatever model they already pay for; this package
   * only builds the grounded prompt and hands it over. Shipping a key, or routing someone
   * else's questions through a server of ours, would make a portfolio reader into a data
   * pipeline nobody consented to.
   *
   * ```js
   * await portfolio.ask('What has he built with Python?', {
   *   complete: async (prompt) => callYourModel(prompt),
   * })
   * ```
   *
   * @param {string} question
   * @param {{complete: (prompt: string) => Promise<string>, sections?: string[]}} options
   * @returns {Promise<{answer: string, prompt: string, grounding: import('./search.js').SearchResult[]}>}
   */
  async ask(question, options) {
    if (typeof options?.complete !== 'function') {
      throw new PortfolioError(
        'ask() needs a model: pass `{ complete: async (prompt) => "..." }`. '
        + 'This package ships no provider and no API key by design — use search() for offline answers.',
        'no-provider',
      )
    }

    const prompt = this.toPrompt({ question, sections: options.sections })
    const answer = await options.complete(prompt)

    return {
      answer,
      prompt,
      // What the deterministic index thinks is relevant, so a caller can show sources
      // alongside the model's answer instead of taking it on faith.
      grounding: this.search(question, { limit: 5 }),
    }
  }
}

export { discoverManifest, validateManifest, PortfolioError } from './manifest.js'
export { buildIndex, rank, tokenize, expandQuery, WEIGHTS } from './search.js'
export { parseQuery, describeQuery } from './query.js'
export { stem, buildSemanticIndex, relatedTerms } from './semantic.js'
export {
  LocalEmbeddingProvider, RemoteEmbeddingProvider, openRouterProvider, groqProvider,
  customProvider, EmbeddingUnavailable, packVectors, unpackVectors, cosine,
  DEFAULT_MODEL, DEFAULT_DIMENSIONS,
} from './embedding.js'
export { manifestToMarkdown, entityToMarkdown, resultsToMarkdown, dedupe } from './markdown.js'
export { manifestToPrompt, entityToPrompt, resultsToPrompt } from './prompt.js'
export default PortfolioAgent
