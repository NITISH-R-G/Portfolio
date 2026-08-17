/**
 * Running connectors.
 *
 * The contract this file exists to enforce: **one source failing must never affect any
 * other, and must never fail the build**. A portfolio whose owner's Kaggle token expired
 * should still show their GitHub work, with a clear note about Kaggle — not a stack trace
 * and an empty page.
 *
 * Every connector therefore runs inside its own try/catch, produces its own status, and
 * contributes its own file under `src/data/generated/sources/`. Nothing here throws.
 *
 * @module connectors/run
 */

import { createHttpClient } from './http.js'
import { resolveDataSources, checkSource } from './index.js'
import { COLLECTIONS } from '../core/schema/types.js'
import { diffProfiles } from '../core/sources/health.js'

/**
 * How many connectors to fetch at once.
 *
 * Sources are independent, so this is bounded by politeness rather than correctness — a
 * handful of concurrent requests to different hosts is well-behaved, while firing thirty
 * at once is the kind of thing that gets an IP rate-limited.
 */
const CONCURRENCY = 4

/**
 * @typedef {object} RunOptions
 * @property {Record<string, Record<string, unknown>>} dataSources
 * @property {(name: string) => string|undefined} [env]
 * @property {typeof globalThis.fetch} [fetch]
 * @property {(message: string) => void} [log]
 * @property {(status: import('./types.js').SourceStatus) => void} [onStatus]
 * @property {number} [now]
 * @property {string[]} [only]     Restrict the run to these source keys.
 * @property {number} [concurrency]
 * @property {Record<string, import('./types.js').SourceStatus>} [previous]
 *   Last run's statuses, so a failure keeps the memory of the last success.
 * @property {Record<string, object>} [previousProfiles]
 *   Last run's output per source, for computing what changed.
 */

/**
 * @typedef {object} RunResult
 * @property {{key: string, connector: string, profile: object}[]} sources
 * @property {Record<string, import('./types.js').SourceStatus>} status
 * @property {string[]} unknown
 */

/**
 * Run every configured connector.
 *
 * @param {RunOptions} options
 * @returns {Promise<RunResult>}
 */
export async function runConnectors(options) {
  const now = options.now ?? Date.now()
  const log = options.log ?? (() => {})
  const env = options.env ?? ((name) => (typeof process !== 'undefined' ? process.env?.[name] : undefined))

  const http = createHttpClient({ fetch: options.fetch, log })
  const { sources: configured, unknown } = resolveDataSources(options.dataSources)

  const selected = options.only?.length
    ? configured.filter((s) => options.only.includes(s.key))
    : configured

  /** @type {Record<string, import('./types.js').SourceStatus>} */
  const status = {}
  /** @type {{key: string, connector: string, profile: object}[]} */
  const sources = []

  const previous = options.previous ?? {}
  const previousProfiles = options.previousProfiles ?? {}

  const queue = [...selected]
  const workers = Array.from(
    { length: Math.min(options.concurrency ?? CONCURRENCY, Math.max(queue.length, 1)) },
    async () => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
        const run = await runOne(item, { http, env, log, now })

        status[item.key] = withHistory(run, previous[item.key], previousProfiles[item.key], now)
        options.onStatus?.(status[item.key])

        if (run.profile) sources.push({ key: item.key, connector: item.connector.id, profile: run.profile })
      }
    },
  )

  await Promise.all(workers)

  // Deterministic order so re-running the import produces a byte-identical set of files
  // when nothing upstream has changed, and the git diff stays meaningful.
  sources.sort((a, b) => a.key.localeCompare(b.key))

  return { sources, status, unknown }
}

/**
 * Fold this run's outcome into what was already known about the source.
 *
 * The load-bearing line is `lastSuccessfulAt`. A failed run must *not* erase it: a source
 * that worked yesterday and timed out this morning is a transient blip, and reporting it as
 * "never imported" would send the user debugging a healthy integration. Keeping the two
 * timestamps apart is what lets the dashboard say "failing since this morning, last good
 * yesterday" instead of just "broken".
 *
 * @param {import('./types.js').ConnectorRun} run
 * @param {import('./types.js').SourceStatus|undefined} previous
 * @param {object|undefined} previousProfile
 * @param {number} now
 * @returns {import('./types.js').SourceStatus}
 */
function withHistory(run, previous, previousProfile, now) {
  const at = new Date(now).toISOString()
  const succeeded = PRODUCTIVE.has(run.status.state) || run.status.state === 'empty'

  return {
    ...run.status,
    lastAttemptedAt: at,
    // Preserved through failure. Only an actual success moves it forward.
    lastSuccessfulAt: succeeded ? at : previous?.lastSuccessfulAt,
    ...(run.status.nextRetryAt ? { nextRetryAt: run.status.nextRetryAt } : {}),
    recordsImported: Object.values(run.status.counts ?? {}).reduce((a, b) => a + b, 0) || undefined,
    // What the refresh actually did. A source can succeed having brought back nothing new,
    // and without this there is no way to tell that apart from a real update.
    ...(run.profile ? { recordsChanged: diffProfiles(previousProfile, run.profile) } : {}),
  }
}

/** States where the connector genuinely produced something. */
const PRODUCTIVE = new Set(['imported', 'partial', 'manual', 'link-only'])

/**
 * Run a single connector and turn every possible outcome into a status.
 *
 * @param {{key: string, connector: import('./types.js').Connector, config: Record<string, unknown>}} item
 * @param {{http: import('./http.js').HttpClient, env: (name: string) => string|undefined, log: (m: string) => void, now: number}} ctx
 * @returns {Promise<import('./types.js').ConnectorRun>}
 */
export async function runOne(item, ctx) {
  const { key, connector, config } = item
  const started = Date.now()

  /** @param {Partial<import('./types.js').SourceStatus>} extra */
  const base = (extra) => /** @type {import('./types.js').SourceStatus} */ ({
    connector: connector.id,
    name: connector.name,
    account: connector.identify?.(config),
    durationMs: Date.now() - started,
    ...extra,
  })

  const check = checkSource(connector, config)
  if (!check.ok) {
    return { status: base({ state: 'skipped', message: check.reason }), profile: null }
  }

  const connectorCtx = {
    http: ctx.http,
    env: ctx.env,
    log: ctx.log,
    now: ctx.now,
  }

  // Connectors that cannot fetch still produce data — a verified link, and whatever the
  // user typed. They go straight to normalize.
  if (typeof connector.fetch !== 'function') {
    const profile = safeNormalize(connector, null, config, ctx)
    if (!profile.ok) {
      return { status: base({ state: 'error', message: profile.message }), profile: null }
    }
    const counts = countRecords(profile.value)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return {
      status: base({
        state: connector.availability === 'url-only' ? 'link-only' : 'manual',
        message: total
          ? `Accepted ${describe(counts)} that you provided.`
          : 'Profile link added. No data was fetched — see this connector\'s limits.',
        counts: total ? counts : undefined,
      }),
      profile: profile.value,
    }
  }

  /** @type {unknown} */
  let raw
  try {
    ctx.log(`  ${connector.name}: fetching…`)
    raw = await connector.fetch(config, connectorCtx)
  } catch (err) {
    const error = /** @type {any} */ (err)
    // `unavailable` means "correctly configured but cannot run here" — a missing
    // credential, not a mistake. Distinguishing it stops the user hunting for a bug.
    const state = error?.unavailable || error?.status === 401 ? 'unavailable' : 'error'

    // A rate limit is not a fault and needs no fixing — it needs waiting. Recording when
    // the platform said to come back turns "it failed" into "try again at 14:20".
    const rateLimited = error?.status === 429
    const nextRetryAt = error?.retryAfterMs
      ? new Date(ctx.now + error.retryAfterMs).toISOString()
      : undefined

    // A failed fetch does not mean the source has nothing to offer. Several connectors also
    // carry fields the user typed directly — a profile link, a tier, a rating — which need
    // no network at all. Salvaging those means an expired token costs the user their live
    // data, not the whole section.
    const salvaged = safeNormalize(connector, null, config, ctx)
    const counts = salvaged.ok ? countRecords(salvaged.value) : {}
    const kept = Object.values(counts).reduce((a, b) => a + b, 0)

    return {
      status: base({
        state,
        message: kept
          ? `${error?.message ?? String(err)} Kept ${describe(counts)} from your configuration.`
          : error?.message ?? String(err),
        fetchedAt: new Date(ctx.now).toISOString(),
        counts: kept ? counts : undefined,
        error: error?.message ?? String(err),
        ...(rateLimited ? { rateLimited: true } : {}),
        ...(nextRetryAt ? { nextRetryAt } : {}),
      }),
      profile: kept && salvaged.ok ? salvaged.value : null,
    }
  }

  const normalized = safeNormalize(connector, raw, config, ctx)
  if (!normalized.ok) {
    return {
      status: base({
        state: 'error',
        message: `Fetched successfully but the response could not be interpreted: ${normalized.message}`,
        fetchedAt: new Date(ctx.now).toISOString(),
      }),
      profile: null,
    }
  }

  const warnings = Array.isArray(/** @type {any} */ (raw)?.warnings)
    ? /** @type {string[]} */ (/** @type {any} */ (raw).warnings).filter((w) => typeof w === 'string')
    : []

  const counts = countRecords(normalized.value)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  const state = total === 0 ? 'empty' : warnings.length ? 'partial' : 'imported'
  const message = total === 0
    ? `Connected, but ${connector.name} returned nothing to show.`
    : `Imported ${describe(counts)}.`

  return {
    status: base({
      state,
      message,
      fetchedAt: new Date(ctx.now).toISOString(),
      counts: total ? counts : undefined,
      warnings: warnings.length ? warnings : undefined,
    }),
    profile: normalized.value,
  }
}

/**
 * `normalize` is documented as never throwing, but it runs over data this project does not
 * control. Wrapping it means an upstream API changing shape degrades one source to an
 * error message instead of taking down `npm run import`.
 *
 * @param {import('./types.js').Connector} connector
 * @param {unknown} raw
 * @param {Record<string, unknown>} config
 * @param {{now: number}} ctx
 * @returns {{ok: true, value: object}|{ok: false, message: string}}
 */
function safeNormalize(connector, raw, config, ctx) {
  try {
    const value = connector.normalize(raw, config, { now: ctx.now })
    if (!value || typeof value !== 'object') {
      return { ok: false, message: 'the connector returned no profile data' }
    }
    return { ok: true, value }
  } catch (err) {
    return { ok: false, message: /** @type {Error} */ (err).message }
  }
}

/**
 * Count what a connector produced, per collection. Shown in the import summary and stored
 * in `status.json` so the admin can say "GitHub: 24 projects, 9 skills" without re-running
 * anything.
 *
 * @param {object} profile
 * @returns {Record<string, number>}
 */
export function countRecords(profile) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const collection of COLLECTIONS) {
    const value = /** @type {Record<string, unknown>} */ (profile)[collection]
    if (Array.isArray(value) && value.length) counts[collection] = value.length
  }
  const stats = /** @type {any} */ (profile).stats?.entries
  if (Array.isArray(stats) && stats.length) counts.stats = stats.length
  return counts
}

/**
 * "24 projects, 9 skills and 3 stats" — a sentence fragment, because these messages are
 * read by people running a command, not parsed by anything.
 *
 * @param {Record<string, number>} counts
 * @returns {string}
 */
function describe(counts) {
  const parts = Object.entries(counts).map(([collection, n]) => `${n} ${label(collection, n)}`)
  if (parts.length <= 1) return parts[0] ?? 'nothing'
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** @param {string} collection @param {number} n */
function label(collection, n) {
  /** @type {Record<string, [string, string]>} */
  const irregular = {
    education: ['education entry', 'education entries'],
    experience: ['role', 'roles'],
    competitive: ['platform', 'platforms'],
    stats: ['stat', 'stats'],
    skills: ['skill', 'skills'],
  }
  const pair = irregular[collection]
  if (pair) return n === 1 ? pair[0] : pair[1]
  return n === 1 ? collection.replace(/s$/, '') : collection
}
