/**
 * Bounded retry for the model download, and nothing else.
 *
 * ## Why this exists
 *
 * `npm run embed` fetches `Xenova/all-MiniLM-L6-v2` from huggingface.co. GitHub Actions runners
 * share outbound IPs with a great many other jobs, and HuggingFace rate-limits by IP, so a
 * production deploy periodically meets a 429 on the very first file it asks for — twice in
 * three runs, at the point this was written. `transformers.js` treats that as fatal, the index
 * is not produced, the manifest honestly reports `lexical+concept+distributional`, and the
 * deploy guard refuses to ship a degraded site. Everything behaves correctly; the deploy simply
 * needs a human to press "re-run", which is not what "your site rebuilds automatically" should
 * mean.
 *
 * A retry is the whole fix. The failure is transient by construction — a rate limit is a
 * request to come back shortly, and it usually tells you exactly how shortly.
 *
 * ## What it deliberately does not do
 *
 * It does not make a genuinely unavailable model look available. When the retries are spent the
 * error propagates exactly as before: `embed.mjs` warns and skips, the manifest reports lexical
 * retrieval, and the guard fails the deploy closed. Making CI green by shipping a worse site is
 * the one outcome this must never produce.
 *
 * It also does not touch the browser. A visitor who meets a 429 gets lexical results and no
 * error, which is the documented degradation and is fine — this is a build-time concern, so it
 * lives in `scripts/` and never enters the bundle.
 *
 * @module scripts/lib/retryFetch
 */

/**
 * Statuses worth trying again.
 *
 * 429 is the one this was written for. The 5xx family and 408/425 are the other ways a healthy
 * request fails for reasons that have nothing to do with the request. Everything absent from
 * this set — 400, 401, 403, 404, 422 — describes something wrong with what was *asked*, and
 * asking again more slowly cannot fix a model name that does not exist or a token that is not
 * valid. Those return immediately, so a real configuration error is still reported in seconds.
 */
export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/** Only ever retry requests that are safe to repeat. The model download is all GETs. */
const IDEMPOTENT = new Set(['GET', 'HEAD', undefined, null, ''])

/** @type {(ms: number) => Promise<void>} */
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * Wrap a fetch implementation so transient failures are retried.
 *
 * Everything that would otherwise make this untestable is injectable: the inner fetch, the
 * clock, the sleep and the randomness. A test can therefore exercise four consecutive 429s and
 * a `Retry-After` header in under a millisecond, without a network.
 *
 * @param {typeof globalThis.fetch} inner
 * @param {{
 *   attempts?: number, baseDelayMs?: number, maxDelayMs?: number, budgetMs?: number,
 *   sleep?: (ms: number) => Promise<void>, random?: () => number, now?: () => number,
 *   onRetry?: (info: {attempt: number, attempts: number, delayMs: number, reason: string, url: string}) => void,
 * }} [options]
 * @returns {typeof globalThis.fetch}
 */
export function retryingFetch(inner, options = {}) {
  const {
    attempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    // The ceiling that keeps CI honest. One request can spend at most this long being patient;
    // past it the failure is reported rather than waited on indefinitely.
    budgetMs = 60_000,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
    onRetry,
  } = options

  return async function fetchWithRetry(input, init) {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (!IDEMPOTENT.has(method)) return inner(input, init)

    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    const deadline = now() + budgetMs

    for (let attempt = 1; ; attempt += 1) {
      const last = attempt >= attempts

      /** @type {Response|undefined} */
      let response
      /** @type {unknown} */
      let failure

      try {
        response = await inner(input, init)
        if (!RETRYABLE_STATUS.has(response.status)) return response
      } catch (error) {
        // A caller-initiated abort is a decision, not a hiccup, and must not be second-guessed.
        if (error?.name === 'AbortError') throw error
        failure = error
      }

      const reason = response ? `HTTP ${response.status}` : `network error (${failure?.message ?? 'unknown'})`
      if (last) {
        if (response) return response
        throw failure
      }

      // The server's own instruction wins over our guess when it gives one.
      const advised = response ? retryAfterMs(response) : null
      const delayMs = advised ?? backoffMs(attempt, { baseDelayMs, maxDelayMs, random })

      // Never sleep past the budget: waiting 60s to then fail is worse than failing now, and a
      // `Retry-After: 300` is a polite way of saying this build should stop waiting.
      if (now() + delayMs > deadline) {
        if (response) return response
        throw failure
      }

      onRetry?.({ attempt, attempts, delayMs, reason, url })
      await sleep(delayMs)
    }
  }
}

/**
 * Exponential backoff with equal jitter.
 *
 * Half the nominal delay plus a random half, rather than full jitter: full jitter can return
 * near-zero and hammer a server that just asked for room, which is the opposite of the point.
 *
 * @param {number} attempt 1-based
 * @param {{baseDelayMs: number, maxDelayMs: number, random: () => number}} options
 * @returns {number}
 */
export function backoffMs(attempt, { baseDelayMs, maxDelayMs, random }) {
  const nominal = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  return Math.round(nominal / 2 + random() * (nominal / 2))
}

/**
 * `Retry-After`, in milliseconds, or `null` when absent or unusable.
 *
 * The header comes in two forms — delta-seconds and an HTTP date — and both appear in the wild.
 * A date in the past means "now", not a negative sleep.
 *
 * @param {Response} response
 * @returns {number|null}
 */
export function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after')
  if (!raw) return null

  const seconds = Number(String(raw).trim())
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.round(seconds * 1000) : null

  const when = Date.parse(String(raw))
  if (Number.isNaN(when)) return null
  return Math.max(0, when - Date.now())
}

/**
 * Install the retrying wrapper as the global fetch, and hand back an undo.
 *
 * A global patch rather than an injected dependency because `transformers.js` captures
 * `globalThis.fetch.bind(globalThis)` into a module-level constant when it is first imported,
 * and exposes no way to pass one in. So the wrapper has to be in place *before* the library is
 * imported — which is why this is called immediately before the first `ready()`, the point at
 * which `embedding.js` dynamically imports it.
 *
 * Scoped and reversible: the caller restores the original in a `finally`.
 *
 * @param {Parameters<typeof retryingFetch>[1]} [options]
 * @returns {() => void} restores the previous global fetch
 */
export function installRetryingFetch(options) {
  const original = globalThis.fetch
  if (typeof original !== 'function') return () => {}

  globalThis.fetch = retryingFetch(original.bind(globalThis), options)
  return () => { globalThis.fetch = original }
}
