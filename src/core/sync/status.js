/**
 * Reading the sync service's status, as untrusted input.
 *
 * The admin shows what a remote URL says about itself, and that URL is whatever the owner typed
 * into `sync.endpoint`. The service this project ships returns exactly the shape below — but
 * the admin cannot know it is talking to that service, only that something answered. So nothing
 * here trusts the response: every field is picked by name, coerced to the type it must be,
 * bounded in size, and anything unrecognised is dropped. A hostile or simply different server
 * therefore cannot make the admin render markup, a gigantic string, a link to somewhere else,
 * or a number that is not one.
 *
 * (React escapes text, so this is not about XSS in the usual sense; it is about the admin showing
 * only what it understands, and about a malformed answer degrading to "no information" rather
 * than to a broken screen.)
 *
 * @module core/sync/status
 */

/** @param {unknown} config the resolved config */
export function syncDeploymentOf(config) {
  const endpoint = /** @type {any} */ (config)?.sync?.endpoint
  return typeof endpoint === 'string' && endpoint ? { endpoint } : {}
}

/** @param {string} endpoint */
export function statusUrlOf(endpoint) {
  return `${endpoint.replace(/\/+$/, '')}/sync/status`
}

const MAX_TEXT = 200
const MAX_LOG = 10

/** @param {unknown} value @param {number} [max] */
const text = (value, max = MAX_TEXT) => (typeof value === 'string' ? value.slice(0, max) : null)

/** A valid timestamp, normalised, or null. */
const when = (/** @type {unknown} */ value) => {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

const count = (/** @type {unknown} */ value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0

/** Only links to a GitHub Actions run are kept, so a status cannot hand the admin an arbitrary link. */
const runLink = (/** @type {unknown} */ value) => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && /\/actions\/runs\/\d+/.test(url.pathname)
      ? url.toString()
      : null
  } catch {
    return null
  }
}

const isObject = (/** @type {unknown} */ v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * @typedef {object} SyncStatus
 * @property {string|null} generatedAt
 * @property {string|null} lastEventAt
 * @property {string|null} lastVia
 * @property {Record<string, number>} counters
 * @property {{count: number, since: string|null, urgency: string|null, attempts: number, retryAt: string|null, stalled: boolean}|null} pending
 * @property {{at: string|null, events: number}|null} lastDispatch
 * @property {{at: string|null, attempts: number, status: number|null, error: string|null}|null} lastFailure
 * @property {{conclusion: string|null, completedAt: string|null, runUrl: string|null, latencyMs: number|null}|null} lastPublish
 * @property {{webhook: {configured: boolean, lastSeenAt: string|null},
 *   eventsPoll: {enabled: boolean, lastSeenAt: string|null, lastPolledAt: string|null, nextPollAt: string|null, lastOutcome: string|null, consecutiveFailures: number}}} mechanisms
 * @property {{at: string|null, kind: string|null, detail: string|null}[]} log
 */

/**
 * @param {unknown} raw
 * @returns {SyncStatus|null} `null` when the response is not a status at all.
 */
export function normalizeSyncStatus(raw) {
  if (!isObject(raw)) return null
  const r = /** @type {Record<string, any>} */ (raw)
  // A response with none of the fields a status always has is not one, whatever else it says.
  if (!isObject(r.counters) && !isObject(r.mechanisms)) return null

  const counters = {}
  for (const [key, value] of Object.entries(isObject(r.counters) ? r.counters : {}).slice(0, 20)) {
    if (/^[a-zA-Z]{1,30}$/.test(key)) /** @type {Record<string, number>} */ (counters)[key] = count(value)
  }

  const pending = isObject(r.pending)
    ? {
        count: count(r.pending.count),
        since: when(r.pending.since),
        urgency: text(r.pending.urgency, 20),
        attempts: count(r.pending.attempts),
        retryAt: when(r.pending.retryAt),
        stalled: r.pending.stalled === true,
      }
    : null

  const webhook = isObject(r.mechanisms?.webhook) ? r.mechanisms.webhook : {}
  const poll = isObject(r.mechanisms?.eventsPoll) ? r.mechanisms.eventsPoll : {}

  return {
    generatedAt: when(r.generatedAt),
    lastEventAt: when(r.lastEventAt),
    lastVia: text(r.lastVia, 20),
    counters,
    pending,
    lastDispatch: isObject(r.lastDispatch) ? { at: when(r.lastDispatch.at), events: count(r.lastDispatch.events) } : null,
    lastFailure: isObject(r.lastFailure)
      ? {
          at: when(r.lastFailure.at),
          attempts: count(r.lastFailure.attempts),
          status: Number.isInteger(r.lastFailure.status) ? r.lastFailure.status : null,
          error: text(r.lastFailure.error),
        }
      : null,
    lastPublish: isObject(r.lastPublish)
      ? {
          conclusion: text(r.lastPublish.conclusion, 30),
          completedAt: when(r.lastPublish.completedAt),
          runUrl: runLink(r.lastPublish.runUrl),
          latencyMs:
            typeof r.lastPublish.latencyMs === 'number' && Number.isFinite(r.lastPublish.latencyMs) && r.lastPublish.latencyMs >= 0
              ? r.lastPublish.latencyMs
              : null,
        }
      : null,
    mechanisms: {
      webhook: { configured: webhook.configured === true, lastSeenAt: when(webhook.lastSeenAt) },
      eventsPoll: {
        enabled: poll.enabled === true,
        lastSeenAt: when(poll.lastSeenAt),
        lastPolledAt: when(poll.lastPolledAt),
        nextPollAt: when(poll.nextPollAt),
        lastOutcome: text(poll.lastOutcome, 30),
        consecutiveFailures: count(poll.consecutiveFailures),
      },
    },
    log: (Array.isArray(r.log) ? r.log : []).filter(isObject).slice(-MAX_LOG).map((entry) => ({
      at: when(entry.at),
      kind: text(entry.kind, 30),
      detail: text(entry.detail, 120),
    })),
  }
}

/**
 * The part of a status `describeSync` reads. Absent fields stay absent: `describeSync` treats
 * a missing observation as "not verified", never as "working".
 *
 * @param {SyncStatus|null|undefined} status
 */
export function observedFrom(status) {
  if (!status) return undefined
  return {
    webhook: { lastSeenAt: status.mechanisms.webhook.lastSeenAt },
    eventsPoll: {
      lastSeenAt: status.mechanisms.eventsPoll.lastSeenAt,
      lastPolledAt: status.mechanisms.eventsPoll.lastPolledAt,
    },
    lastPublish: status.lastPublish && { conclusion: status.lastPublish.conclusion ?? undefined, latencyMs: status.lastPublish.latencyMs },
  }
}
