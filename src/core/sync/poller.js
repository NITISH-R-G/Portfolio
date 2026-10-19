/**
 * The polling door: GitHub's Events API, asked politely.
 *
 * Where no webhook is configured this is the fastest *permitted* way to notice a change, and
 * "permitted" is doing real work in that sentence. GitHub states how often it may be asked, in
 * the response itself: `X-Poll-Interval` (seconds). Honouring it is not optional courtesy — it
 * is the documented contract for this endpoint — so the interval used is the larger of what the
 * caller wants and what GitHub just said.
 *
 * Three behaviours worth naming:
 *
 * - **Conditional.** Every request offers the previous `ETag`. A `304` costs nothing against the
 *   rate limit, which is what makes polling every minute affordable.
 * - **Baseline first.** The first poll has nothing to compare against, so every event on the page
 *   would look new. It records what is there and emits nothing; later polls emit only what is
 *   not in that record.
 * - **A set of seen ids, not a cursor.** This was a cursor ("highest id seen") until a live
 *   probe showed it was wrong. The feed mixes event types whose ids come from *different
 *   sequences* — in one real response, pushes and repository creations were around 24.4 billion
 *   while stars and pull requests were around 17.5 billion, and neither id nor `created_at`
 *   ordered the page. With a cursor, a brand-new event from the lower sequence would have been
 *   older than the cursor and silently skipped. Membership in a bounded set has no such
 *   assumption: an event is new if it has not been seen, whatever its number.
 *
 * ## The latency floor, stated plainly
 *
 * The endpoint is cached by GitHub (`Cache-Control: max-age=300` when probed) and its own
 * documentation says events can lag from seconds to hours. No polling interval can beat that.
 * Polling every minute makes this service *prompt*; it does not make the provider fast.
 *
 * @module core/sync/poller
 */

import { parsePolledGitHubEvents } from './github.js'
import { nextDelay } from './retry.js'

const API = 'https://api.github.com'

/** Never poll faster than this, whatever the provider permits. */
export const MIN_POLL_MS = 60_000

/**
 * @typedef {object} PollState
 * @property {string} [etag]
 * @property {string[]} [seen]        Ids already accounted for, newest page first, bounded.
 * @property {string} [nextPollAt]    ISO time before which not to ask again.
 * @property {number} [failures]      Consecutive failures, for backoff.
 * @property {string} [lastPolledAt]
 * @property {string} [lastOutcome]
 */

/**
 * How many ids to remember. A page is at most 30 events (`per_page=30`); several pages' worth
 * keeps an event that briefly drops off the page and returns from being mistaken for new,
 * while keeping the stored state small enough to be a trivial KV value.
 */
export const SEEN_LIMIT = 300

/**
 * Ask GitHub what the account did, once.
 *
 * Never throws: every outcome is a value the caller can store and report.
 *
 * @param {{account: string, state?: PollState, token?: string, fetch?: typeof fetch,
 *   now?: () => number, random?: () => number}} input
 * @returns {Promise<{
 *   outcome: 'not-due'|'baseline'|'unchanged'|'changes'|'rate-limited'|'error',
 *   state: PollState,
 *   changes: import('./github.js').ChangeEvent[],
 *   message?: string,
 * }>}
 */
export async function pollGitHubEvents({
  account, state = {}, token, fetch: doFetch = fetch, now = Date.now, random = Math.random,
}) {
  const t = now()
  if (state.nextPollAt && t < Date.parse(state.nextPollAt)) {
    return { outcome: 'not-due', state, changes: [] }
  }

  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'portfolio-sync/1.0',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(state.etag ? { 'if-none-match': state.etag } : {}),
  }

  /** @param {Partial<PollState>} patch @param {number} waitMs */
  const advance = (patch, waitMs) => ({
    ...state,
    ...patch,
    lastPolledAt: new Date(t).toISOString(),
    nextPollAt: new Date(t + waitMs).toISOString(),
  })

  let response
  try {
    response = await doFetch(
      `${API}/users/${encodeURIComponent(account)}/events/public?per_page=30`,
      { headers },
    )
  } catch (error) {
    const failures = (state.failures ?? 0) + 1
    return {
      outcome: 'error',
      changes: [],
      message: error instanceof Error ? error.message : 'network error',
      state: advance(
        { failures, lastOutcome: 'error' },
        Math.max(MIN_POLL_MS, nextDelay(failures - 1, { random })),
      ),
    }
  }

  // What GitHub says about when to come back. Taken from every response, including errors.
  const permittedMs = Number(response.headers.get('x-poll-interval')) * 1000 || 0
  const waitMs = Math.max(MIN_POLL_MS, permittedMs)

  if (response.status === 304) {
    return {
      outcome: 'unchanged',
      changes: [],
      state: advance({ failures: 0, lastOutcome: 'unchanged' }, waitMs),
    }
  }

  if (response.status === 403 || response.status === 429) {
    // `Number(null)` is 0, which is finite: a header that is *absent* must not read as one that
    // says "retry after 0 seconds", or every plain 403 would look like a rate limit.
    const header = (name) => {
      const raw = response.headers.get(name)
      const value = raw === null ? NaN : Number(raw)
      return Number.isFinite(value) ? value : undefined
    }
    const retryAfterSeconds = header('retry-after')
    const reset = header('x-ratelimit-reset')
    const remaining = response.headers.get('x-ratelimit-remaining')
    // Only a rate limit if the response says so; a plain 403 is a refusal, not a wait.
    const limited =
      response.status === 429 || retryAfterSeconds !== undefined || remaining === '0'
    if (limited) {
      const untilReset = reset !== undefined && reset > 0 ? Math.max(0, reset * 1000 - t) : 0
      const wait = Math.max(waitMs, (retryAfterSeconds ?? 0) * 1000, untilReset)
      return {
        outcome: 'rate-limited',
        changes: [],
        message: 'GitHub rate limit reached',
        state: advance({ failures: (state.failures ?? 0) + 1, lastOutcome: 'rate-limited' }, wait),
      }
    }
  }

  if (!response.ok) {
    const failures = (state.failures ?? 0) + 1
    return {
      outcome: 'error',
      changes: [],
      message: `GitHub returned HTTP ${response.status}`,
      state: advance(
        { failures, lastOutcome: 'error' },
        Math.max(waitMs, nextDelay(failures - 1, { random })),
      ),
    }
  }

  let events
  try {
    events = await response.json()
  } catch {
    events = null
  }
  if (!Array.isArray(events)) {
    // A 200 whose body is not the documented shape. The old etag is kept so the next poll
    // refetches rather than trusting a response that could not be read.
    return {
      outcome: 'error',
      changes: [],
      message: 'GitHub returned an unexpected response',
      state: advance({ failures: (state.failures ?? 0) + 1, lastOutcome: 'error' }, waitMs),
    }
  }

  const etag = response.headers.get('etag') ?? undefined

  const current = events.map((e) => String(e?.id)).filter((id) => id !== 'undefined')
  const known = new Set(state.seen ?? [])
  // Current page first, so the most recent ids survive the cap.
  const seen = [...new Set([...current, ...(state.seen ?? [])])].slice(0, SEEN_LIMIT)

  if (state.seen === undefined) {
    return {
      outcome: 'baseline',
      changes: [],
      state: advance({ etag, seen, failures: 0, lastOutcome: 'baseline' }, waitMs),
    }
  }

  const fresh = events.filter((e) => !known.has(String(e?.id)))
  const changes = parsePolledGitHubEvents(fresh, { now: new Date(t).toISOString(), account })

  return {
    outcome: changes.length ? 'changes' : 'unchanged',
    changes,
    state: advance(
      { etag, seen, failures: 0, lastOutcome: changes.length ? 'changes' : 'unchanged' },
      waitMs,
    ),
  }
}
