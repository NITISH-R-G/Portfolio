/**
 * Embedding providers, and the vector arithmetic the hybrid ranker needs.
 *
 * ## Why the local provider is the default and not the fallback
 *
 * A portfolio that only becomes searchable when its owner is paying an inference bill is not a
 * portfolio anyone can rely on, and an open-source project whose headline feature requires the
 * reader to open an account with a third party has quietly stopped being open source. So the
 * default path runs a pretrained model on the reader's own machine: no key, no account, no
 * network call once the weights are cached, and no per-search cost to anybody.
 *
 * The hosted providers exist because someone will legitimately want them — a very large
 * portfolio, a device that should not run inference, an existing inference budget. They are
 * opt-in, and nothing in the project depends on one being configured.
 *
 * ## What a vector is allowed to do here
 *
 * Rank. Nothing else. A cosine similarity says *this text is probably about the same thing as
 * that text*, which is a retrieval signal and not a fact about a person. It can decide what to
 * show first; it can never create a claim, add evidence, or change provenance. That boundary
 * is enforced in the ranker — semantic scores contribute to ordering and are labelled as
 * `semantic` in `matched`, so a reader is never shown a similarity dressed up as a citation.
 *
 * @module @portfolio-engine/agent/embedding
 */

/**
 * The model every default install uses.
 *
 * Chosen by measurement, not by reputation — see `benchmarks/embeddings.mjs`. It is the
 * smallest model tested that separated genuine paraphrases from unrelated records on this
 * corpus, it is Apache-2.0, and its quantized weights are ~23 MB, which is affordable as a
 * lazily-fetched, browser-cached asset and would not be at 100 MB.
 */
export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'

/** Dimensions the default model emits. Stored alongside vectors so a mismatch is detectable. */
export const DEFAULT_DIMENSIONS = 384

/**
 * A pretrained model running wherever the caller is — Node at build time, the browser at
 * query time. Same weights, same vectors, so a query embedded in a browser is comparable with
 * documents embedded during the build.
 *
 * `@huggingface/transformers` is an optional dependency, imported dynamically. A consumer who
 * never embeds anything never loads it, and one who has not installed it gets a clear message
 * rather than a module-resolution stack trace.
 */
export class LocalEmbeddingProvider {
  /**
   * @param {{model?: string, dtype?: string, progress?: (info: unknown) => void}} [options]
   */
  constructor(options = {}) {
    this.id = 'local'
    this.model = options.model ?? DEFAULT_MODEL
    this.dtype = options.dtype ?? 'q8'
    this.dimensions = DEFAULT_DIMENSIONS
    this.requiresKey = false
    this._progress = options.progress
    this._pipeline = null
    this._loading = null
  }

  /**
   * Load the weights. Idempotent, and concurrent callers share one load rather than starting
   * several multi-megabyte fetches for the same model.
   */
  async ready() {
    if (this._pipeline) return this._pipeline
    if (this._loading) return this._loading

    this._loading = (async () => {
      let transformers
      try {
        transformers = await import('@huggingface/transformers')
      } catch {
        throw new EmbeddingUnavailable(
          'Local embeddings need @huggingface/transformers. Install it, or configure a provider.',
        )
      }
      this._pipeline = await transformers.pipeline('feature-extraction', this.model, {
        dtype: this.dtype,
        ...(this._progress ? { progress_callback: this._progress } : {}),
      })
      return this._pipeline
    })()

    try {
      return await this._loading
    } finally {
      // Cleared either way: a failed load must not poison every later attempt.
      this._loading = null
    }
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<number[][]>} Unit-length vectors, so cosine similarity is a dot product.
   */
  async embed(texts) {
    const list = texts.filter((t) => typeof t === 'string')
    if (!list.length) return []
    const extract = await this.ready()
    const output = await extract(list, { pooling: 'mean', normalize: true })
    return output.tolist()
  }
}

/**
 * An OpenAI-compatible embeddings endpoint.
 *
 * Covers OpenRouter, Groq, OpenAI itself and most self-hosted servers, because they all speak
 * the same request shape. One class rather than three near-identical ones — the difference
 * between them is a base URL.
 *
 * The key is supplied by the caller and never read from a bundled config: a browser build must
 * not be able to pick one up, because anything the browser can read is public.
 */
export class RemoteEmbeddingProvider {
  /**
   * @param {{
   *   id?: string, baseUrl: string, model: string, apiKey: string,
   *   dimensions?: number, fetch?: typeof globalThis.fetch,
   * }} options
   */
  constructor(options) {
    if (!options?.apiKey) throw new EmbeddingUnavailable('This provider needs an API key.')
    this.id = options.id ?? 'remote'
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.model = options.model
    this.dimensions = options.dimensions
    this.requiresKey = true
    this._apiKey = options.apiKey
    this._fetch = options.fetch ?? globalThis.fetch
  }

  async ready() { return this }

  /**
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embed(texts) {
    const list = texts.filter((t) => typeof t === 'string')
    if (!list.length) return []

    const response = await this._fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this._apiKey}` },
      body: JSON.stringify({ model: this.model, input: list }),
    })

    if (!response.ok) {
      throw new EmbeddingUnavailable(`${this.id} embeddings failed: ${response.status}`)
    }

    const payload = await response.json()
    // Order is not guaranteed by the spec, so results are placed by index rather than assumed.
    const vectors = new Array(list.length)
    for (const item of payload.data ?? []) vectors[item.index ?? 0] = normalize(item.embedding)
    return vectors.filter(Boolean)
  }
}

/** OpenRouter, preconfigured. Opt-in; nothing defaults to it. */
export const openRouterProvider = (apiKey, options = {}) => new RemoteEmbeddingProvider({
  id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: options.model ?? 'openai/text-embedding-3-small', apiKey, ...options,
})

/** Groq, preconfigured. Opt-in; nothing defaults to it. */
export const groqProvider = (apiKey, options = {}) => new RemoteEmbeddingProvider({
  id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: options.model ?? 'nomic-embed-text-v1.5', apiKey, ...options,
})

/** Anything else that speaks the same shape — a self-hosted server, a company gateway. */
export const customProvider = (options) => new RemoteEmbeddingProvider({ id: 'custom', ...options })

/** Raised when embeddings cannot be produced. Callers degrade to lexical search on this. */
export class EmbeddingUnavailable extends Error {
  constructor(message) {
    super(message)
    this.name = 'EmbeddingUnavailable'
  }
}

/* Vector storage -------------------------------------------------------------- */

/**
 * Pack unit vectors as int8.
 *
 * A float32 index for this corpus is ~184 kB; the same vectors at int8 are ~46 kB, and the
 * precision lost is far below the margin between a relevant and an irrelevant result. The
 * index ships to every visitor, so a 4× reduction for no measurable ranking change is the
 * right trade.
 *
 * @param {number[][]} vectors
 * @returns {{dimensions: number, count: number, scale: number, data: string}}
 */
export function packVectors(vectors) {
  const dimensions = vectors[0]?.length ?? 0
  const bytes = new Int8Array(vectors.length * dimensions)

  vectors.forEach((vector, row) => {
    for (let i = 0; i < dimensions; i += 1) {
      // Vectors are unit-length, so components sit in [-1, 1] and 127 uses the full range.
      bytes[row * dimensions + i] = Math.max(-127, Math.min(127, Math.round(vector[i] * 127)))
    }
  })

  return {
    dimensions,
    count: vectors.length,
    scale: 1 / 127,
    data: Buffer.from(bytes.buffer).toString('base64'),
  }
}

/**
 * Unpack an int8 index back into vectors.
 *
 * @param {{dimensions: number, count: number, scale: number, data: string}} packed
 * @returns {Float32Array[]}
 */
export function unpackVectors(packed) {
  if (!packed?.data) return []
  const binary = typeof Buffer !== 'undefined'
    ? Buffer.from(packed.data, 'base64')
    : Uint8Array.from(atob(packed.data), (c) => c.charCodeAt(0))
  const bytes = new Int8Array(binary.buffer ?? binary, binary.byteOffset ?? 0, packed.count * packed.dimensions)

  const out = []
  for (let row = 0; row < packed.count; row += 1) {
    const vector = new Float32Array(packed.dimensions)
    for (let i = 0; i < packed.dimensions; i += 1) vector[i] = bytes[row * packed.dimensions + i] * packed.scale
    out.push(vector)
  }
  return out
}

/**
 * Cosine similarity. Both sides are expected to be unit-length, so this is a dot product —
 * quantized vectors drift slightly off unit length, which shifts scores by far less than the
 * thresholds care about.
 *
 * @param {ArrayLike<number>} a @param {ArrayLike<number>} b
 * @returns {number}
 */
export function cosine(a, b) {
  if (!a || !b) return 0
  let sum = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) sum += a[i] * b[i]
  return sum
}

/** @param {number[]} vector */
function normalize(vector) {
  let magnitude = 0
  for (const value of vector) magnitude += value * value
  magnitude = Math.sqrt(magnitude) || 1
  return vector.map((value) => value / magnitude)
}
