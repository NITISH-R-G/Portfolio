/**
 * The one place connectors are allowed to touch the network.
 *
 * Centralizing it buys three things that matter more than the small indirection cost:
 * every request gets a timeout (a hung socket must not hang `npm run import`), every
 * retryable failure is retried identically, and every connector becomes testable by
 * passing a stub `fetch` instead of standing up a server.
 *
 * @module connectors/http
 */

/** Requests that take longer than this are almost certainly not coming back. */
const DEFAULT_TIMEOUT_MS = 15_000

/** Network blips and 5xx are retried; nothing else is. */
const DEFAULT_RETRIES = 2

/**
 * Identifies the tool to platform operators. Several APIs (npm, Semantic Scholar, dblp,
 * Codeforces) explicitly ask for a descriptive User-Agent, and some reject requests
 * without one.
 */
const USER_AGENT =
  'portfolio-engine/1.0 (+https://github.com/NITISH-R-G/Portfolio; open-source portfolio generator)'

/**
 * A request failed in a way the caller may want to distinguish. Carries the HTTP status
 * so a connector can tell "this account does not exist" (404 — the user made a typo) from
 * "the platform is down" (503 — try again later), because those need different messages.
 */
export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, url?: string, retryable?: boolean, retryAfterMs?: number}} [info]
   */
  constructor(message, info = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = info.status
    this.url = info.url
    this.retryable = info.retryable ?? false
    this.retryAfterMs = info.retryAfterMs
  }
}

/**
 * Turn a status code into a sentence a non-engineer can act on. Connectors surface this
 * verbatim in `npm run import` output and in the admin, so it is written for the user,
 * not for a log.
 *
 * @param {number} status
 * @param {string} platform
 * @returns {string}
 */
export function explainStatus(status, platform) {
  switch (status) {
    case 400: return `${platform} rejected the request as malformed.`
    case 401: return `${platform} requires authentication. Check the credential in your .env file.`
    case 403: return `${platform} refused the request — usually a rate limit or a private profile.`
    case 404: return `${platform} has no such account or resource. Check the username in portfolio.config.js.`
    case 410: return `That ${platform} resource has been deleted.`
    case 422: return `${platform} could not process the request. The identifier may be in the wrong format.`
    case 429: return `${platform} rate limit reached. Wait a few minutes and run the import again.`
    default:
      if (status >= 500) return `${platform} is having trouble right now (HTTP ${status}). This is not a problem with your configuration.`
      return `${platform} returned HTTP ${status}.`
  }
}

/**
 * How long to wait before a retry, honouring the server's own instruction when it gives
 * one. `Retry-After` may be seconds or an HTTP date; both forms appear in the wild.
 *
 * @param {Headers|undefined} headers
 * @param {number} now
 * @returns {number|undefined} milliseconds
 */
export function retryAfterMs(headers, now = Date.now()) {
  if (!headers?.get) return undefined

  // Reported as the platform stated it, *not* clamped to how long this client is willing to
  // wait. Those are different questions: the retry loop below decides whether to sleep,
  // while this value is also surfaced to the user as "retry after 14:20". Capping it here
  // would tell someone to come back in a minute when the platform said an hour, and they
  // would simply fail again.
  //
  // Bounded only against absurdity — a day is far past the point where any of it matters.
  const sane = (ms) => (Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 86_400_000) : undefined)

  const raw = headers.get('retry-after')
  if (raw) {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) return sane(seconds * 1000)
    const at = Date.parse(raw)
    if (Number.isFinite(at)) return sane(at - now)
  }

  // GitHub and the Stack Exchange API signal exhaustion this way instead.
  const remaining = Number(headers.get('x-ratelimit-remaining'))
  const reset = Number(headers.get('x-ratelimit-reset'))
  if (remaining === 0 && Number.isFinite(reset)) {
    // The header is a Unix timestamp in seconds for GitHub, and a delta for some others.
    const resetMs = reset > 1e6 ? reset * 1000 - now : reset * 1000
    return sane(resetMs)
  }
  return undefined
}

/**
 * @typedef {object} HttpClient
 * @property {(url: string, options?: RequestOptions) => Promise<unknown>} json
 * @property {(url: string, options?: RequestOptions) => Promise<string>} text
 * @property {(url: string, options?: RequestOptions) => Promise<unknown|null>} jsonOrNull
 *   Resolves to `null` on 404 instead of throwing, for "this optional thing may not exist".
 * @property {() => number} requestCount
 */

/**
 * @typedef {object} RequestOptions
 * @property {Record<string, string>} [headers]
 * @property {string} [method]
 * @property {unknown} [body]           Serialized as JSON when present.
 * @property {number} [timeoutMs]
 * @property {number} [retries]
 * @property {string} [platform]        Used in error messages. Defaults to the hostname.
 */

/**
 * Build an HTTP client.
 *
 * @param {object} [options]
 * @param {typeof globalThis.fetch} [options.fetch]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {(message: string) => void} [options.log]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries]
 * @returns {HttpClient}
 */
export function createHttpClient(options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const log = options.log ?? (() => {})
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const defaultRetries = options.retries ?? DEFAULT_RETRIES

  if (typeof doFetch !== 'function') {
    throw new Error('No fetch implementation available. Node 18+ is required.')
  }

  let requests = 0

  /**
   * @param {string} url
   * @param {RequestOptions} opts
   * @param {'json'|'text'} as
   * @param {boolean} nullOn404
   */
  async function request(url, opts, as, nullOn404) {
    const platform = opts.platform ?? safeHost(url)
    const retries = opts.retries ?? defaultRetries
    const timeoutMs = opts.timeoutMs ?? defaultTimeout

    let attempt = 0
    // Loop rather than recurse so the retry budget is obvious and bounded.
    for (;;) {
      requests += 1
      let response
      try {
        response = await withTimeout(doFetch, url, opts, timeoutMs)
      } catch (err) {
        const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError'
        const message = aborted
          ? `${platform} did not respond within ${Math.round(timeoutMs / 1000)}s.`
          : `Could not reach ${platform} (${err?.message ?? 'network error'}).`
        if (attempt >= retries) throw new HttpError(message, { url, retryable: true })
        attempt += 1
        await sleep(backoff(attempt))
        continue
      }

      if (response.ok) {
        try {
          return as === 'json' ? await response.json() : await response.text()
        } catch {
          throw new HttpError(`${platform} returned a response that could not be parsed.`, {
            url, status: response.status,
          })
        }
      }

      if (nullOn404 && response.status === 404) return null

      const wait = retryAfterMs(response.headers, Date.now())
      const retryable = response.status >= 500 || response.status === 429

      if (retryable && attempt < retries) {
        attempt += 1
        const delay = wait ?? backoff(attempt)
        // A rate-limit reset can be minutes away; waiting that long inside a build is worse
        // than failing this one source and letting the rest of the import finish.
        if (delay <= 10_000) {
          log(`  ${platform}: HTTP ${response.status}, retrying in ${Math.round(delay / 1000)}s`)
          await sleep(delay)
          continue
        }
      }

      throw new HttpError(explainStatus(response.status, platform), {
        url, status: response.status, retryable, retryAfterMs: wait,
      })
    }
  }

  return {
    json: (url, opts = {}) => /** @type {Promise<unknown>} */ (request(url, opts, 'json', false)),
    text: (url, opts = {}) => /** @type {Promise<string>} */ (request(url, opts, 'text', false)),
    jsonOrNull: (url, opts = {}) => /** @type {Promise<unknown|null>} */ (request(url, opts, 'json', true)),
    requestCount: () => requests,
  }
}

/**
 * Apply a hard timeout. `AbortSignal.timeout` alone would not compose with a caller's own
 * signal, and we want the timeout regardless of what the caller passed.
 *
 * @param {typeof globalThis.fetch} doFetch
 * @param {string} url
 * @param {RequestOptions} opts
 * @param {number} timeoutMs
 */
async function withTimeout(doFetch, url, opts, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await doFetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json, text/plain, */*',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: controller.signal,
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Exponential backoff with a small deterministic step; no jitter, so tests stay stable. */
function backoff(attempt) {
  return Math.min(500 * 2 ** (attempt - 1), 4000)
}

/** @param {string} url */
function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the platform'
  }
}

export { USER_AGENT, DEFAULT_TIMEOUT_MS }
