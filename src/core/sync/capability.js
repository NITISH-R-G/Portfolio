/**
 * How a source actually updates, said honestly.
 *
 * Three different things get called "automatic", and a portfolio owner deserves to know which
 * one they have:
 *
 * 1. **A webhook** — the provider tells the sync service when something changes.
 * 2. **Polling** — the sync service asks the provider, as often as the provider permits.
 * 3. **The schedule** — the repository rebuilds weekly and on every push, and re-imports then.
 *
 * Only the third needs nothing but this repository. The first two need the sync service
 * deployed, and even then each has limits that are the *provider's*, not ours.
 *
 * ## "Effective" means observed
 *
 * It would be easy, and wrong, to report the best mechanism a connector *could* use. A webhook
 * that was configured but has never delivered, or a service URL that nothing is answering, is
 * indistinguishable from no webhook until something has actually arrived. So the effective
 * mechanism is promoted only on **evidence the service has recorded** — a delivery seen, a poll
 * completed — and until then the answer is the schedule, with the better options listed as
 * `unverified`. The cost is a slightly more cautious label for the first minutes after setup;
 * the alternative is a label that can be false.
 *
 * Nothing here is a table of connectors. Mechanisms come from each connector's own `sync`
 * declaration, and absence means the schedule.
 *
 * @module core/sync/capability
 */

import { SCHEDULE } from '../sources/refresh.js'

/** How recently a delivery or poll must have happened for a mechanism to count as working. */
export const OBSERVED_WITHIN_MS = {
  webhook: 30 * 24 * 60 * 60 * 1000, // a quiet account may legitimately go weeks without an event
  'events-poll': 60 * 60 * 1000, // a poll that has not run in an hour is not working
}

/**
 * @typedef {object} Deployment
 * @property {string} [endpoint]   The sync service's public URL, if the owner has deployed one.
 *
 * @typedef {object} Observed
 *   What the service reports about itself (`GET /sync/status`). All optional: absent means we
 *   could not ask, which must read as "not verified", never as "working".
 * @property {{lastSeenAt?: string|null}} [webhook]
 * @property {{lastSeenAt?: string|null, lastPolledAt?: string|null}} [eventsPoll]
 * @property {{latencyMs?: number|null, conclusion?: string}|null} [lastPublish]
 *
 * @typedef {'webhook'|'events-poll'|'schedule'|'manual'} EffectiveMechanism
 *
 * @typedef {object} SyncDescription
 * @property {EffectiveMechanism} effective
 * @property {string} summary
 * @property {string} latency
 * @property {{kind: string, status: 'observed'|'unverified'|'not-deployed', latency: string,
 *   setup?: string, blindTo?: string[]}[]} mechanisms
 * @property {number} [observedLatencyMs]  Event to site live, as measured, never estimated.
 */

/** @param {string|null|undefined} iso @param {number} withinMs @param {number} now */
const recent = (iso, withinMs, now) => {
  if (!iso) return false
  const at = Date.parse(iso)
  return Number.isFinite(at) && now - at <= withinMs
}

/**
 * @param {import('../../connectors/types.js').Connector|undefined} connector
 * @param {{deployment?: Deployment, observed?: Observed, now?: number}} [context]
 * @returns {SyncDescription}
 */
export function describeSync(connector, { deployment, observed, now = Date.now() } = {}) {
  if (typeof connector?.fetch !== 'function') {
    return {
      effective: 'manual',
      summary: 'Updates when you edit it. There is nothing to read from this platform.',
      latency: 'Whenever you change it.',
      mechanisms: [],
    }
  }

  const deployed = Boolean(deployment?.endpoint)
  const declared = connector.sync?.mechanisms ?? []

  const mechanisms = declared.map((mechanism) => {
    /** @type {'observed'|'unverified'|'not-deployed'} */
    let status = 'not-deployed'
    if (deployed) {
      const seen =
        mechanism.kind === 'webhook'
          ? recent(observed?.webhook?.lastSeenAt, OBSERVED_WITHIN_MS.webhook, now)
          : recent(observed?.eventsPoll?.lastPolledAt, OBSERVED_WITHIN_MS['events-poll'], now)
      status = seen ? 'observed' : 'unverified'
    }
    return {
      kind: mechanism.kind,
      status,
      latency: mechanism.latency,
      ...(mechanism.setup ? { setup: mechanism.setup } : {}),
      ...(mechanism.blindTo ? { blindTo: mechanism.blindTo } : {}),
    }
  })

  const working = (kind) => mechanisms.find((m) => m.kind === kind && m.status === 'observed')
  const observedLatencyMs =
    observed?.lastPublish?.conclusion === 'success' && Number.isFinite(observed.lastPublish.latencyMs)
      ? /** @type {number} */ (observed.lastPublish.latencyMs)
      : undefined

  const base = { mechanisms, ...(observedLatencyMs !== undefined ? { observedLatencyMs } : {}) }

  // A webhook outranks polling because it is the one that also sees other people's stars and
  // forks, and because it does not depend on a feed the provider caches for minutes.
  const webhook = working('webhook')
  if (webhook) {
    return {
      ...base,
      effective: 'webhook',
      summary: 'Updates when the provider notifies the sync service.',
      latency: webhook.latency,
    }
  }

  const poll = working('events-poll')
  if (poll) {
    return {
      ...base,
      effective: 'events-poll',
      summary: 'The sync service checks the provider on a timer and republishes when something changed.',
      latency: poll.latency,
    }
  }

  return {
    ...base,
    effective: 'schedule',
    summary: deployed
      ? `The sync service is configured but has not been seen working yet; until it has, this refreshes ${SCHEDULE.description}, and on every push to main.`
      : `Refreshes ${SCHEDULE.description}, and on every push to main.`,
    latency: 'Up to a week, or at your next push.',
  }
}
