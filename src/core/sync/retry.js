/**
 * When to try again.
 *
 * The existing HTTP client retries inside one request with a small deterministic step — right
 * for a short-lived import where a test needs stable timing. A long-running service has a
 * different problem: when a provider has an outage, every client that failed at the same moment
 * retries at the same moments, and the recovering provider is hit by the whole herd at once.
 * The standard remedy is *full jitter* (AWS Architecture Blog, "Exponential Backoff And
 * Jitter"): wait a uniformly random time between zero and the exponential ceiling, which
 * spreads retries across the whole interval instead of clustering them at its end.
 *
 * `random` is injectable so a test can pin it; nothing here reads a clock or a global.
 *
 * @module core/sync/retry
 */

export const BACKOFF = Object.freeze({ baseMs: 5_000, maxMs: 15 * 60_000 })

/**
 * Full-jitter exponential delay for the Nth failed attempt (0-based).
 *
 * @param {number} attempt
 * @param {{baseMs?: number, maxMs?: number, random?: () => number}} [options]
 * @returns {number} milliseconds, an integer in [0, ceiling)
 */
export function backoffDelay(attempt, options = {}) {
  const { baseMs = BACKOFF.baseMs, maxMs = BACKOFF.maxMs, random = Math.random } = options
  const n = Math.max(0, Math.floor(attempt))
  // `2 ** n` overflows to Infinity long before it matters; the cap makes that harmless.
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.min(n, 30))
  return Math.floor(random() * ceiling)
}

/**
 * The delay to use after a failure, never shorter than the provider asked for.
 *
 * A server that sends `Retry-After` knows something we do not; retrying sooner than that is
 * both rude and pointless. Jitter is applied *on top of* it rather than instead of it, so the
 * herd is still spread but nobody arrives early.
 *
 * @param {number} attempt
 * @param {{retryAfterMs?: number, baseMs?: number, maxMs?: number, random?: () => number}} [options]
 * @returns {number}
 */
export function nextDelay(attempt, options = {}) {
  const { retryAfterMs, ...rest } = options
  const floor = Number.isFinite(retryAfterMs) && /** @type {number} */ (retryAfterMs) > 0
    ? /** @type {number} */ (retryAfterMs)
    : 0
  return floor + backoffDelay(attempt, rest)
}

/**
 * Whether a status is worth retrying at all.
 *
 * 4xx other than these are the caller's mistake and retrying cannot fix them — a rejected
 * signature or a missing permission stays rejected.
 *
 * @param {number} status
 */
export function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}
