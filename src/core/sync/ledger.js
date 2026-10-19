/**
 * The sync ledger: what has been seen, what is waiting, what was published.
 *
 * Everything a webhook receiver needs to be *safe* rather than merely *working* lives here, and
 * all of it follows from one fact: **an event is an invalidation signal, not a state delta.**
 * The build that a publish triggers re-reads the authoritative state from the provider; it never
 * applies an event's payload. So:
 *
 * - a **duplicate** can cause at most a redundant publish — and is recognised and dropped anyway;
 * - an **out-of-order** event cannot corrupt anything, because nothing depends on order;
 * - an event **already covered** by a build that started after it needs no build of its own;
 * - a burst **coalesces**: the first change publishes (leading edge), later ones wait out a
 *   cooldown and ride a single trailing publish.
 *
 * ## States
 *
 * ```
 *   event ─► dedupe ─► covered? ─► classify ─► pending ─► [cooldown] ─► publish ─► lastDispatch
 *                                                  ▲                        │ failure
 *                                                  └──── retryAt (backoff) ◄┘
 *   workflow_run(completed) ─► lastPublish   (a failed run re-arms pending; the old site stays up)
 * ```
 *
 * Nothing here reads a clock, a random number, the network or a vendor SDK: all four are
 * injected, which is what lets every transition above be driven deterministically in a test.
 *
 * @module core/sync/ledger
 */

import { DEFER_MS, classify } from './policy.js'
import { nextDelay } from './retry.js'

export const DEFAULTS = Object.freeze({
  /** After a publish, how long later changes wait before the next one. A deploy takes ~3 minutes. */
  cooldownMs: 90_000,
  /** How long `'defer'`red changes wait for company. */
  deferMs: DEFER_MS,
  /** How long a seen delivery id is remembered. GitHub redelivers within hours, not weeks. */
  dedupeTtlSeconds: 24 * 60 * 60,
  /**
   * An event is "covered" by an earlier publish only if it happened this long *before* it, so
   * a few seconds of clock skew between the provider and us can only cause an extra build,
   * never a missed one.
   */
  coverageMarginMs: 30_000,
  /** Consecutive failed attempts before the ledger stops retrying on its own. */
  maxAttempts: 5,
  /** Entries kept in the visible log. */
  logSize: 25,
})

const STATE_KEY = 'sync:state'

/** Anything that looks like a credential, removed before it can reach stored or served state. */
const SECRET_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+\S+|sha256=[0-9a-f]{64})/gi

/** @param {unknown} value */
export function safeText(value, max = 200) {
  return String(value ?? '').replace(SECRET_PATTERN, '[redacted]').slice(0, max)
}

/**
 * @typedef {object} PublishResult
 * @property {boolean} ok
 * @property {number} [status]
 * @property {number} [retryAfterMs]
 * @property {string} [error]
 *
 * @typedef {(request: {source: string, events: number, ids: string[], kinds: Record<string, number>}) => Promise<PublishResult>} Publish
 */

function emptyState() {
  return {
    version: 1,
    counters: {
      accepted: 0, duplicates: 0, covered: 0, ignored: 0,
      dispatched: 0, coalesced: 0, failures: 0, publishFailures: 0,
    },
    lastEventAt: null,
    lastVia: null,
    // When each mechanism last *delivered* — observed, not configured. A webhook that was set up
    // but never fires looks identical to no webhook until you can see this.
    lastSeen: {},
    pending: null,
    lastDispatch: null,
    lastFailure: null,
    lastPublish: null,
    publishFailureStreak: 0,
    log: [],
  }
}

/**
 * @param {{store: import('./store.js').SyncStore, publish: Publish, source?: string,
 *   now?: () => number, random?: () => number, options?: Partial<typeof DEFAULTS>}} deps
 */
export function createSyncLedger({
  store, publish, source = 'github', now = Date.now, random = Math.random, options = {},
}) {
  const opt = { ...DEFAULTS, ...options }
  const stamp = (ms = now()) => new Date(ms).toISOString()

  async function load() {
    const saved = await store.get(STATE_KEY)
    const fresh = emptyState()
    return saved
      ? { ...fresh, ...saved, counters: { ...fresh.counters, ...saved.counters } }
      : fresh
  }

  /** @param {ReturnType<typeof emptyState>} state @param {string} kind @param {string} detail */
  function log(state, kind, detail) {
    state.log.push({ at: stamp(), kind, detail: safeText(detail, 120) })
    if (state.log.length > opt.logSize) state.log.splice(0, state.log.length - opt.logSize)
  }

  /**
   * Whether a publish that already happened covers this change.
   *
   * It does only if the build it started could have seen the change (the change happened
   * clearly before the dispatch) and that build did not then fail — a failed build left the old
   * site up, so nothing was actually published.
   */
  function isCovered(state, change) {
    const dispatch = state.lastDispatch
    if (!dispatch || !change.occurredAt) return false
    const failed = state.lastPublish?.dispatchedAt === dispatch.at && state.lastPublish.conclusion !== 'success'
    if (failed && state.lastPublish.conclusion !== 'cancelled') return false
    return Date.parse(change.occurredAt) <= Date.parse(dispatch.at) - opt.coverageMarginMs
  }

  function addPending(state, change, decision) {
    const at = stamp()
    const pending = state.pending ?? {
      since: at, lastAt: at, count: 0, ids: [], kinds: {}, urgency: 'defer', attempts: 0,
    }
    pending.count += 1
    pending.lastAt = at
    if (pending.ids.length < 20) pending.ids.push(change.id)
    pending.kinds[change.kind] = (pending.kinds[change.kind] ?? 0) + 1
    if (decision === 'now') pending.urgency = 'now'
    // New news revives a stalled batch, but with a single attempt left, so a dead endpoint is
    // not hammered once per event.
    if (pending.stalled) {
      pending.stalled = false
      pending.attempts = Math.max(0, opt.maxAttempts - 1)
    }
    state.pending = pending
  }

  /** @returns {Promise<{dispatched?: boolean, failed?: boolean, skipped?: string}>} */
  async function attempt(state) {
    const pending = state.pending
    if (!pending) return { skipped: 'nothing-pending' }
    const t = now()

    if (pending.stalled) return { skipped: 'stalled' }
    if (pending.retryAt && t < Date.parse(pending.retryAt)) return { skipped: 'backoff' }
    if (state.lastDispatch && t < Date.parse(state.lastDispatch.at) + opt.cooldownMs) {
      return { skipped: 'cooldown' }
    }
    if (pending.urgency === 'defer' && t < Date.parse(pending.since) + opt.deferMs) {
      return { skipped: 'deferred' }
    }

    let result
    try {
      result = await publish({ source, events: pending.count, ids: pending.ids, kinds: pending.kinds })
    } catch (error) {
      // A publisher is supposed to return a result, not throw. One that throws is treated as a
      // failed attempt rather than allowed to lose the pending batch.
      result = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    if (result.ok) {
      state.lastDispatch = {
        at: stamp(t), events: pending.count, firstEventAt: pending.since, kinds: pending.kinds,
      }
      state.lastFailure = null
      state.counters.dispatched += 1
      state.pending = null
      log(state, 'dispatch', `${pending.count} change(s) → publish requested`)
      return { dispatched: true }
    }

    pending.attempts += 1
    pending.retryAt = stamp(t + nextDelay(pending.attempts - 1, { retryAfterMs: result.retryAfterMs, random }))
    pending.stalled = pending.attempts >= opt.maxAttempts
    state.lastFailure = {
      at: stamp(t), attempts: pending.attempts, status: result.status, error: safeText(result.error),
    }
    state.counters.failures += 1
    log(state, 'dispatch-failed', `attempt ${pending.attempts}: ${result.error ?? result.status}`)
    return { failed: true }
  }

  return {
    /**
     * Take in a batch of changes. Safe to call twice with the same batch.
     *
     * @param {import('./github.js').ChangeEvent[]} changes
     * @returns {Promise<{id: string, outcome: 'duplicate'|'covered'|'ignored'|'dispatched'|'coalesced'|'failed'}[]>}
     */
    async handle(changes) {
      const state = await load()
      /** @type {{id: string, outcome: string}[]} */
      const results = []

      for (const change of changes) {
        const seenKey = `seen:${source}:${change.id}`
        if (await store.get(seenKey)) {
          state.counters.duplicates += 1
          results.push({ id: change.id, outcome: 'duplicate' })
          continue
        }
        await store.put(seenKey, 1, { ttlSeconds: opt.dedupeTtlSeconds })

        state.lastEventAt = change.receivedAt
        state.lastVia = change.via
        state.lastSeen = { ...state.lastSeen, [change.via]: change.receivedAt }

        if (isCovered(state, change)) {
          state.counters.covered += 1
          results.push({ id: change.id, outcome: 'covered' })
          continue
        }

        const decision = classify(change)
        if (decision === 'ignore') {
          state.counters.ignored += 1
          results.push({ id: change.id, outcome: 'ignored' })
          continue
        }

        state.counters.accepted += 1
        addPending(state, change, decision)
        results.push({ id: change.id, outcome: 'pending' })
        log(state, 'event', `${change.kind} via ${change.via}`)
      }

      const outcome = await attempt(state)
      for (const result of results) {
        if (result.outcome !== 'pending') continue
        result.outcome = outcome.dispatched ? 'dispatched' : outcome.failed ? 'failed' : 'coalesced'
        if (result.outcome === 'coalesced') state.counters.coalesced += 1
      }

      await store.put(STATE_KEY, state)
      return /** @type {any} */ (results)
    },

    /**
     * Publish anything that was waiting for a cooldown, a deferral window or a retry time.
     * Called on a schedule; harmless when there is nothing to do.
     */
    async flush() {
      const state = await load()
      const outcome = await attempt(state)
      // Only a dispatch or a failure changes anything. This runs every minute, and an idle
      // service that rewrote its state each time would spend ~1,440 writes a day on nothing —
      // more than Cloudflare KV's free tier allows in total.
      if (outcome.dispatched || outcome.failed) await store.put(STATE_KEY, state)
      return outcome
    },

    /**
     * A publish finished. This is the only way the service learns whether a change actually
     * reached the site, so it is also where observed latency comes from.
     *
     * Only runs that *we* started count: a push or the weekly schedule is not ours to report
     * on, and folding them in would make the latency figure meaningless.
     *
     * @param {import('./github.js').WorkflowRun} run
     */
    async recordPublish(run) {
      if (run.event !== 'repository_dispatch') return { outcome: 'not-ours' }
      const state = await load()
      const dispatch = state.lastDispatch

      state.lastPublish = {
        conclusion: run.conclusion,
        completedAt: run.completedAt ?? null,
        runUrl: run.url ?? null,
        dispatchedAt: dispatch?.at ?? null,
        latencyMs: dispatch?.firstEventAt && run.completedAt
          ? Math.max(0, Date.parse(run.completedAt) - Date.parse(dispatch.firstEventAt))
          : null,
      }

      if (run.conclusion === 'success') {
        state.publishFailureStreak = 0
        log(state, 'publish', `live (${Math.round((state.lastPublish.latencyMs ?? 0) / 1000)}s from first change)`)
      } else if (run.conclusion === 'cancelled') {
        // GitHub's concurrency group replaced it with a newer run, which will report for itself.
        log(state, 'publish', 'superseded by a newer run')
      } else {
        // Failed or timed out. The previously deployed site is still up; the change is not.
        // Re-arm so it is retried, with backoff, and bounded like any other failure.
        state.counters.publishFailures += 1
        state.publishFailureStreak += 1
        const t = now()
        const pending = state.pending ?? {
          since: dispatch?.firstEventAt ?? stamp(t), lastAt: stamp(t), count: 0, ids: [], kinds: {}, attempts: 0,
        }
        pending.urgency = 'now'
        pending.attempts = state.publishFailureStreak
        pending.retryAt = stamp(t + nextDelay(state.publishFailureStreak - 1, { random }))
        pending.stalled = state.publishFailureStreak >= opt.maxAttempts
        state.pending = pending
        log(state, 'publish-failed', `run ${run.conclusion}; retrying`)
      }

      await store.put(STATE_KEY, state)
      return { outcome: 'recorded', conclusion: run.conclusion }
    },

    /**
     * What is safe to show anyone: counts, times and short messages. No payloads, no delivery
     * ids beyond a count, no credentials (`safeText` strips anything credential-shaped).
     */
    async status() {
      const state = await load()
      const pending = state.pending
      return {
        source,
        generatedAt: stamp(),
        lastEventAt: state.lastEventAt,
        lastVia: state.lastVia,
        lastSeen: state.lastSeen,
        counters: state.counters,
        pending: pending
          ? {
              count: pending.count,
              since: pending.since,
              urgency: pending.urgency,
              attempts: pending.attempts,
              retryAt: pending.retryAt ?? null,
              stalled: Boolean(pending.stalled),
            }
          : null,
        lastDispatch: state.lastDispatch && { at: state.lastDispatch.at, events: state.lastDispatch.events },
        lastFailure: state.lastFailure,
        lastPublish: state.lastPublish,
        log: state.log.slice(-10),
      }
    },
  }
}
