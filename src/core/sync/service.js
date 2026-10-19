/**
 * The sync service, assembled.
 *
 * This is everything a deployment does, minus the deployment: verify a delivery, interpret it,
 * hand it to the ledger, poll on a schedule, report status. The Cloudflare Worker in
 * `workers/sync` is a router over this file and nothing more — which is deliberate, because it
 * means every behaviour that matters runs under Node's test runner with real `Request`-free
 * inputs, and a different host (a container, another edge runtime) needs a new router and no
 * new logic.
 *
 * Responses are `{status, body}` values rather than `Response` objects for the same reason.
 *
 * @module core/sync/service
 */

import { parseGitHubWebhook } from './github.js'
import { createSyncLedger } from './ledger.js'
import { MIN_POLL_MS, pollGitHubEvents } from './poller.js'
import { verifySha256 } from './signature.js'

/** Largest webhook body accepted. GitHub allows 25 MB; a profile change never needs that. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024

const POLL_KEY = 'sync:poll:github'

/**
 * How often an otherwise-unchanged poll state is rewritten, as a heartbeat.
 *
 * `describeSync` decides whether polling is "working" from `lastPolledAt`, so it must not go
 * stale — but writing it every minute would cost ~1,440 KV writes a day against a free allowance
 * of 1,000. Ten minutes keeps the evidence fresh (the window is an hour) at ~144 a day.
 */
export const POLL_HEARTBEAT_MS = 10 * 60_000

/** @param {string[]|undefined} a @param {string[]|undefined} b */
const sameIds = (a, b) => a === b || (a?.length === b?.length && (a ?? []).every((id, i) => id === b?.[i]))

/**
 * Whether a poll changed anything worth persisting.
 *
 * A `304` leaves the ETag and the seen-id set as they were. Skipping the write loses nothing: the next
 * scheduled tick is a minute away anyway, which is the polling floor, so `nextPollAt` would
 * already have passed. It is persisted only when it matters — the provider asked for a longer
 * wait, or something failed and backoff must survive the next invocation.
 *
 * @param {import('./poller.js').PollState} before
 * @param {import('./poller.js').PollState} after
 * @param {string} outcome
 * @param {number} now
 */
export function shouldPersistPoll(before, after, outcome, now) {
  if (outcome !== 'unchanged') return true
  if (after.etag !== before.etag || !sameIds(before.seen, after.seen)) return true
  if ((after.failures ?? 0) !== (before.failures ?? 0)) return true
  if (Date.parse(after.nextPollAt ?? '') - now > MIN_POLL_MS + 5_000) return true
  const last = Date.parse(before.lastPolledAt ?? '')
  return !Number.isFinite(last) || now - last >= POLL_HEARTBEAT_MS
}

/**
 * @param {{
 *   store: import('./store.js').SyncStore,
 *   publish: import('./ledger.js').Publish,
 *   account: string,
 *   webhookSecret?: string,
 *   pollEnabled?: boolean,
 *   token?: string,
 *   fetch?: typeof fetch,
 *   now?: () => number,
 *   random?: () => number,
 *   workflowPath?: string,
 *   ledgerOptions?: Parameters<typeof createSyncLedger>[0]['options'],
 * }} deps
 */
export function createSyncService({
  store, publish, account, webhookSecret, pollEnabled = true, token,
  fetch: doFetch = fetch, now = Date.now, random = Math.random, workflowPath, ledgerOptions,
}) {
  const ledger = createSyncLedger({ store, publish, now, random, options: ledgerOptions })

  return {
    /**
     * One webhook delivery.
     *
     * Order matters and is the security boundary: size, then signature, and only then does
     * anything look inside the body. Nothing a forged request contains is parsed.
     *
     * @param {{rawBody: string, headers: {get: (name: string) => string|null}}} request
     * @returns {Promise<{status: number, body: Record<string, unknown>}>}
     */
    async handleWebhook({ rawBody, headers }) {
      // Failing closed on a missing secret means a deployment that forgot to set it refuses
      // everything, and says so in a way the owner sees in GitHub's delivery log.
      if (!webhookSecret) return { status: 503, body: { error: 'webhook-not-configured' } }
      if (rawBody.length > MAX_BODY_BYTES) return { status: 413, body: { error: 'too-large' } }

      const valid = await verifySha256(webhookSecret, rawBody, headers.get('x-hub-signature-256'))
      if (!valid) return { status: 401, body: { error: 'invalid-signature' } }

      let payload
      try {
        payload = JSON.parse(rawBody)
      } catch {
        return { status: 400, body: { error: 'invalid-json' } }
      }

      const outcome = parseGitHubWebhook({
        event: headers.get('x-github-event'),
        delivery: headers.get('x-github-delivery'),
        payload,
        now: new Date(now()).toISOString(),
        account,
        workflowPath,
      })

      switch (outcome.type) {
        case 'ping':
          return { status: 200, body: { ok: true, pong: true } }
        case 'ignored':
          // 200, not 4xx: GitHub flags a delivery that gets an error, and "not interesting"
          // is not an error.
          return { status: 200, body: { ok: true, ignored: outcome.reason } }
        case 'workflow': {
          const recorded = await ledger.recordPublish(outcome.run)
          return { status: 200, body: { ok: true, ...recorded } }
        }
        case 'change': {
          const [result] = await ledger.handle([outcome.change])
          return { status: 202, body: { ok: true, outcome: result.outcome } }
        }
        default:
          return { status: 200, body: { ok: true } }
      }
    },

    /**
     * The scheduled tick: publish what was waiting, then ask the provider.
     *
     * Flush first, so a trailing publish that has come due is not delayed by a slow poll.
     * Neither step can throw into the other — a failing poll must not stop the flush from
     * running next time.
     */
    async tick() {
      const flushed = await ledger.flush()
      if (!pollEnabled) return { flushed, polled: { outcome: 'disabled' } }

      const state = (await store.get(POLL_KEY)) ?? {}
      const polled = await pollGitHubEvents({ account, state, token, fetch: doFetch, now, random })

      if (polled.outcome !== 'not-due' && shouldPersistPoll(state, polled.state, polled.outcome, now())) {
        await store.put(POLL_KEY, polled.state)
      }
      if (polled.changes.length) await ledger.handle(polled.changes)

      return { flushed, polled: { outcome: polled.outcome, changes: polled.changes.length } }
    },

    /** Everything that is safe to show. See `ledger.status`. */
    async status() {
      const [ledgerStatus, poll] = await Promise.all([ledger.status(), store.get(POLL_KEY)])
      return {
        ...ledgerStatus,
        mechanisms: {
          webhook: { configured: Boolean(webhookSecret), lastSeenAt: ledgerStatus.lastSeen?.webhook ?? null },
          eventsPoll: {
            enabled: pollEnabled,
            lastSeenAt: ledgerStatus.lastSeen?.['events-poll'] ?? null,
            lastPolledAt: poll?.lastPolledAt ?? null,
            nextPollAt: poll?.nextPollAt ?? null,
            lastOutcome: poll?.lastOutcome ?? null,
            consecutiveFailures: poll?.failures ?? 0,
          },
        },
      }
    },
  }
}
