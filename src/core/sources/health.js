/**
 * Source health.
 *
 * Once someone has ten sources connected, "did that work?" stops being answerable by
 * reading scrollback. They need a standing answer per source: is it working, when did it
 * last actually succeed, what did it bring in, and what changed.
 *
 * Two distinctions do most of the work here.
 *
 * **Attempted is not the same as succeeded.** A run that fails must not erase the memory of
 * the last one that worked — otherwise a transient outage makes a healthy source look like
 * it has never run, and the user cannot tell a blip from a broken integration.
 *
 * **Stale is derived, not stored.** A source is not *in* a stale state; it is connected,
 * and its data is old. Storing staleness would mean rewriting every status file as time
 * passes, and would go wrong the moment a clock disagreed.
 *
 * @module core/sources/health
 */

/**
 * @typedef {'connected'|'partial'|'empty'|'manual'|'link-only'|'stale'
 *   |'authentication-required'|'rate-limited'|'unsupported'|'error'|'skipped'|'never-run'} HealthState
 */

/**
 * How each state should read, and how loudly.
 *
 * `tone` drives colour; `actionable` says whether the user can do anything about it. That
 * second flag is what keeps a dashboard honest: "LinkedIn cannot be fetched" is permanent
 * and not a problem to solve, while "your token expired" is.
 */
export const HEALTH_STATES = {
  connected: { label: 'Connected', tone: 'ok', actionable: false },
  // Not actionable: a partial import *worked*, and its warnings say what more is available
  // — usually an optional token. Counting it as needing attention would nag permanently
  // about something that is already fine.
  partial: { label: 'Partial', tone: 'warn', actionable: false },
  stale: { label: 'Stale', tone: 'warn', actionable: true },
  empty: { label: 'Nothing found', tone: 'muted', actionable: false },
  manual: { label: 'Entered by you', tone: 'info', actionable: false },
  'link-only': { label: 'Linked', tone: 'info', actionable: false },
  'authentication-required': { label: 'Needs a credential', tone: 'warn', actionable: true },
  'rate-limited': { label: 'Rate limited', tone: 'warn', actionable: false },
  unsupported: { label: 'Not supported', tone: 'muted', actionable: false },
  error: { label: 'Failed', tone: 'error', actionable: true },
  skipped: { label: 'Not configured', tone: 'muted', actionable: true },
  'never-run': { label: 'Never imported', tone: 'warn', actionable: true },
}

/**
 * How long imported data stays fresh.
 *
 * Fourteen days is a judgement, not a law: long enough that a weekly-ish habit never sees a
 * warning, short enough that a portfolio someone is actively sending out is not quietly
 * months behind. Overridable per call.
 */
export const STALE_AFTER_DAYS = 14

/**
 * @typedef {object} SourceHealth
 * @property {string} key                 The `dataSources` key.
 * @property {string} connector
 * @property {string} name
 * @property {HealthState} state          What to show now, staleness included.
 * @property {HealthState} recordedState  What the last run actually concluded.
 * @property {string} message
 * @property {string} [account]
 * @property {string} [lastAttemptedAt]
 * @property {string} [lastSuccessfulAt]
 * @property {string} [nextRetryAt]
 * @property {string} [error]
 * @property {number} [recordsImported]
 * @property {{added: number, removed: number, updated: number}} [recordsChanged]
 * @property {Record<string, number>} [counts]
 * @property {string[]} [warnings]
 * @property {number} [durationMs]
 * @property {boolean} stale
 * @property {number} [ageDays]           Days since the last success.
 * @property {boolean} actionable
 * @property {boolean} canRefresh         Whether refreshing it would do anything.
 */

/**
 * Map a run outcome onto a health state.
 *
 * The run layer reports what happened mechanically; this decides what it means. Splitting
 * `unavailable` is the point: a missing credential is a thing the user can fix, while a
 * platform with no API never will be, and showing both as one state would send people
 * hunting for a token that does not exist.
 *
 * @param {import('../../connectors/types.js').SourceStatus} status
 * @param {import('../../connectors/types.js').Connector} [connector]
 * @returns {HealthState}
 */
export function stateOf(status, connector) {
  switch (status?.state) {
    case 'imported': return 'connected'
    case 'partial': return 'partial'
    case 'empty': return 'empty'
    case 'manual': return 'manual'
    case 'link-only': return 'link-only'
    case 'skipped': return 'skipped'
    case 'unavailable':
      // A credential this project can be told about is fixable; a platform that publishes
      // nothing is not.
      return connector?.authEnv?.length ? 'authentication-required' : 'unsupported'
    case 'error':
      return status.rateLimited ? 'rate-limited' : 'error'
    default:
      return 'never-run'
  }
}

/**
 * Turn a stored status into everything the dashboard needs.
 *
 * @param {object} options
 * @param {string} options.key
 * @param {import('../../connectors/types.js').Connector} [options.connector]
 * @param {import('../../connectors/types.js').SourceStatus} [options.status]
 * @param {Record<string, unknown>} [options.config]
 * @param {number} [options.now]
 * @param {number} [options.staleAfterDays]
 * @returns {SourceHealth}
 */
export function deriveHealth({ key, connector, status, config, now = Date.now(), staleAfterDays = STALE_AFTER_DAYS }) {
  const recordedState = stateOf(status, connector)
  const lastSuccessfulAt = status?.lastSuccessfulAt ?? (isSuccess(recordedState) ? status?.fetchedAt : undefined)

  const ageDays = lastSuccessfulAt ? daysBetween(Date.parse(lastSuccessfulAt), now) : undefined

  // Only a source that *can* go stale does. A manual entry has no upstream to drift from,
  // so calling it stale would be telling the user to refresh something that cannot change.
  const refreshable = typeof connector?.fetch === 'function'
  const stale = Boolean(
    refreshable && isSuccess(recordedState) && ageDays !== undefined && ageDays >= staleAfterDays,
  )

  const state = stale ? 'stale' : recordedState
  const info = HEALTH_STATES[state] ?? HEALTH_STATES.error

  return {
    key,
    connector: connector?.id ?? key,
    name: connector?.name ?? key,
    state,
    recordedState,
    message: stale
      ? `Last imported ${describeAge(ageDays)}. Refresh to bring it up to date.`
      : status?.message ?? defaultMessage(recordedState, connector),
    account: status?.account ?? connector?.identify?.(config ?? {}),
    lastAttemptedAt: status?.lastAttemptedAt ?? status?.fetchedAt,
    lastSuccessfulAt,
    nextRetryAt: status?.nextRetryAt,
    error: status?.error,
    recordsImported: status?.recordsImported ?? totalOf(status?.counts),
    recordsChanged: status?.recordsChanged,
    counts: status?.counts,
    warnings: status?.warnings,
    durationMs: status?.durationMs,
    stale,
    ageDays,
    actionable: info.actionable,
    canRefresh: refreshable,
  }
}

/**
 * A one-line summary of the whole set, for the dashboard header.
 *
 * @param {SourceHealth[]} healths
 */
export function summarize(healths) {
  const counts = { connected: 0, attention: 0, informational: 0 }
  let records = 0
  /** @type {string|undefined} */
  let oldestSuccess

  for (const health of healths) {
    records += health.recordsImported ?? 0

    // Bucketed by the same rule the dashboard sorts on, so the headline count and the row
    // order can never tell the user two different stories.
    if (health.actionable) counts.attention += 1
    else if (isSuccess(health.state)) counts.connected += 1
    else counts.informational += 1

    if (health.lastSuccessfulAt && (!oldestSuccess || health.lastSuccessfulAt < oldestSuccess)) {
      oldestSuccess = health.lastSuccessfulAt
    }
  }

  return { total: healths.length, ...counts, records, oldestSuccess }
}

/**
 * What changed between two imports of the same source.
 *
 * Answers "what did that refresh actually do?", which is otherwise invisible — a source can
 * report success having brought back nothing new, and a user watching a progress line has
 * no way to tell that apart from a real update.
 *
 * Compared by record key and a shallow value fingerprint, so a changed star count counts as
 * an update rather than as a removal plus an addition.
 *
 * @param {object|undefined} before
 * @param {object|undefined} after
 * @returns {{added: number, removed: number, updated: number}}
 */
export function diffProfiles(before, after) {
  const previous = fingerprint(before)
  const next = fingerprint(after)

  let added = 0
  let removed = 0
  let updated = 0

  for (const [key, hash] of next) {
    if (!previous.has(key)) added += 1
    else if (previous.get(key) !== hash) updated += 1
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) removed += 1
  }

  return { added, removed, updated }
}

/**
 * Every record in a profile, as `collection/id` → a hash of its contents.
 *
 * `source` is excluded from the hash: it carries `fetchedAt`, which changes on every single
 * import, and including it would report every record as updated every time.
 *
 * @param {object|undefined} profile
 * @returns {Map<string, string>}
 */
function fingerprint(profile) {
  /** @type {Map<string, string>} */
  const out = new Map()
  if (!profile || typeof profile !== 'object') return out

  for (const [collection, records] of Object.entries(profile)) {
    if (!Array.isArray(records)) continue
    for (const record of records) {
      if (!record || typeof record !== 'object') continue
      const { source: _source, ...rest } = record
      const id = record.id ?? record.name ?? record.title ?? record.platform ?? JSON.stringify(rest).slice(0, 40)
      out.set(`${collection}/${id}`, stableHash(rest))
    }
  }
  return out
}

/** Key order must not affect the hash, or a re-serialization would read as a change. */
function stableHash(value) {
  const json = stringify(value)
  let hash = 5381
  for (let i = 0; i < json.length; i += 1) hash = (((hash << 5) + hash) ^ json.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

function stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/* -------------------------------------------------------------------------- */

/** States that mean the source genuinely produced something this run. */
const SUCCESS = new Set(['connected', 'partial', 'empty', 'manual', 'link-only'])

/** @param {HealthState} state */
export const isSuccess = (state) => SUCCESS.has(state)

/** @param {Record<string, number>|undefined} counts */
function totalOf(counts) {
  if (!counts) return undefined
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

/** @param {number} from @param {number} to */
function daysBetween(from, to) {
  if (!Number.isFinite(from)) return undefined
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/** @param {number|undefined} days */
export function describeAge(days) {
  if (days === undefined) return 'never'
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

/** @param {HealthState} state @param {import('../../connectors/types.js').Connector} [connector] */
function defaultMessage(state, connector) {
  switch (state) {
    case 'never-run': return 'Configured but never imported.'
    case 'skipped': return `Not configured — ${connector?.name ?? 'this source'} needs an identifier.`
    case 'unsupported': return connector?.limits ?? 'This platform cannot be fetched automatically.'
    default: return ''
  }
}
