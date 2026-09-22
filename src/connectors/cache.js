/**
 * Conditional requests, and the store that makes them possible.
 *
 * ## What this is for
 *
 * Most of what an import fetches has not changed since the last one. Asking a provider to send
 * it all again is wasteful for them and slow for us — and for GitHub specifically it is worse
 * than wasteful, because a full response costs a request against a rate limit that a `304 Not
 * Modified` does not.
 *
 * So when a provider hands back a validator — an `ETag` or a `Last-Modified` — it is kept, and
 * the next request offers it back. If the provider says nothing changed, the previous body is
 * reused and no bytes cross the wire.
 *
 * ## Support is discovered, never declared
 *
 * No connector states whether its provider supports this, and none should: a claim like that
 * is one API change away from being a lie, and there are twenty automatically-fetched
 * connectors to keep honest. Instead the rule is mechanical — **a validator is only ever sent
 * if the provider itself supplied one.** A provider that sends no `ETag` never receives an
 * `If-None-Match`, and nothing anywhere has to know which is which.
 *
 * Verified to genuinely return 304 at the time of writing: GitHub, DEV Community, PyPI, and
 * RSS/Atom feeds served with validators. Verified *not* to send validators: Docker Hub, ORCID,
 * and npm's search endpoint — those simply keep doing full fetches, with no special-casing.
 *
 * ## Why the body is stored too
 *
 * A 304 carries no body, and the caller asked for data. Storing only the validator would mean
 * answering a 304 with nothing, which is worse than not revalidating at all. The provider
 * remains the authority: a cached body is used only when the provider explicitly says it is
 * still current.
 *
 * @module connectors/cache
 */

/**
 * @typedef {object} CacheEntry
 * @property {string} [etag]
 * @property {string} [lastModified]
 * @property {unknown} body           The response as the caller wanted it — parsed or text.
 * @property {string} storedAt        ISO timestamp, for pruning.
 */

/**
 * @typedef {object} HttpCache
 * @property {(key: string) => CacheEntry|undefined} get
 * @property {(key: string, entry: CacheEntry) => void} set
 * @property {() => {hits: number, misses: number, stored: number}} stats
 * @property {() => Record<string, CacheEntry>} entries
 */

/** Entries older than this are dropped when the store is loaded. */
export const MAX_AGE_DAYS = 30

/**
 * Build a cache over a plain object.
 *
 * Deliberately not filesystem-aware: the import script owns reading and writing the file, and
 * the connectors own none of it. That keeps this testable with no disk and keeps a browser
 * bundle from ever pulling `node:fs` in through a connector.
 *
 * @param {Record<string, CacheEntry>} [initial]
 * @param {{now?: number}} [options]
 * @returns {HttpCache}
 */
export function createHttpCache(initial = {}, options = {}) {
  const now = options.now ?? Date.now()
  /** @type {Map<string, CacheEntry>} */
  const store = new Map()

  for (const [key, entry] of Object.entries(initial ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    const age = now - Date.parse(entry.storedAt ?? '')
    // A validator for a URL nothing has asked about in a month is not worth carrying, and a
    // malformed timestamp is treated as expired rather than as ageless.
    if (!Number.isFinite(age) || age > MAX_AGE_DAYS * 86_400_000) continue
    store.set(key, entry)
  }

  const stats = { hits: 0, misses: 0, stored: 0 }

  return {
    get(key) {
      const entry = store.get(key)
      if (entry) stats.hits += 1
      else stats.misses += 1
      return entry
    },
    set(key, entry) {
      store.set(key, entry)
      stats.stored += 1
    },
    stats: () => ({ ...stats }),
    entries: () => Object.fromEntries(store),
  }
}

/**
 * The cache key for a request.
 *
 * The method is part of it because a `HEAD` and a `GET` of the same URL are different answers,
 * and the URL is used whole — a query string is what distinguishes one page of results from
 * the next.
 *
 * @param {string} url
 * @param {string} [method]
 */
export function cacheKey(url, method = 'GET') {
  return `${method.toUpperCase()} ${url}`
}

/**
 * The conditional headers to add, given what is stored.
 *
 * Returns an empty object when there is nothing to revalidate against — which is the case for
 * every provider that does not send validators, without either of them knowing about the other.
 *
 * @param {CacheEntry|undefined} entry
 * @returns {Record<string, string>}
 */
export function conditionalHeaders(entry) {
  if (!entry) return {}
  const headers = {}
  // Both are offered when both are known. A server that understands only one ignores the
  // other, and `If-None-Match` takes precedence per RFC 9110 where both are present.
  if (entry.etag) headers['if-none-match'] = entry.etag
  if (entry.lastModified) headers['if-modified-since'] = entry.lastModified
  return headers
}

/**
 * The validator a response carries, if any.
 *
 * @param {Headers|undefined} headers
 * @returns {{etag?: string, lastModified?: string}|undefined}
 */
export function validatorOf(headers) {
  const etag = headers?.get?.('etag') ?? undefined
  const lastModified = headers?.get?.('last-modified') ?? undefined
  if (!etag && !lastModified) return undefined
  return {
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
  }
}
