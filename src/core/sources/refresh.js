/**
 * Whether a source can keep itself current, and how.
 *
 * This module exists to answer one question honestly: *if I connect this and walk away, what
 * happens?* The answer is usually "it refreshes on the schedule the repository runs on", and
 * sometimes "nothing, because this platform publishes nothing readable" — and the difference
 * has to be visible before someone connects, not discovered weeks later when a portfolio is
 * quietly months out of date.
 *
 * Nothing here is a new capability model. Every field is derived from what the connector
 * already declares — `availability`, `fetch`, `authEnv` — or from what the deployment actually
 * does. There is no per-connector table of refresh behaviour to keep in sync, because a table
 * like that is wrong the moment someone adds the thirtieth connector and forgets it.
 *
 * ## Cadence is global, and deliberately so
 *
 * The only automatic execution this project has is one GitHub Actions workflow: a weekly cron
 * plus a run on every push to `main`. Actions cannot create independent per-source schedules,
 * so `cadence` reports the repository's schedule for *every* source rather than a per-source
 * promise nothing would keep. A config value claiming `refreshEvery: 'hourly'` would be a lie
 * told once and believed forever, so no such value exists.
 *
 * ## Webhooks are described, not offered
 *
 * Several providers do support webhooks. This project has nowhere to receive one: the public
 * site is a static export with no server, and the admin API is a loopback process that exists
 * only while a developer is running it. `webhook.ingestible` is therefore `false` everywhere,
 * and `webhook.providerSupports` records the provider's side purely so the gap is documented
 * rather than forgotten.
 *
 * @module core/sources/refresh
 */

/** What the deployment actually runs, read from `.github/workflows/deploy.yml`. */
export const SCHEDULE = Object.freeze({
  cron: '0 6 * * 1',
  description: 'weekly, Mondays at 06:00 UTC',
  alsoOn: 'every push to main',
  // Stated so nothing downstream can imply otherwise.
  perSource: false,
})

/**
 * Providers with documented webhook support of their own.
 *
 * Kept short and conservative: only platforms whose webhooks are a first-class, documented
 * feature for the kind of data this project imports. A provider having *some* webhook
 * somewhere is not evidence that it can notify us about a profile, so most connectors are
 * simply absent from this list rather than guessed at.
 *
 * None of this is usable today — see the module note.
 */
const PROVIDER_WEBHOOKS = new Set(['github', 'gitlab', 'bitbucket', 'dockerhub'])

/**
 * @typedef {object} RefreshPolicy
 * @property {'automatic'|'blocked'|'manual'|'unsupported'} mode
 * @property {string} summary          One line, for the admin.
 * @property {string} method           How it refreshes: an API, a feed, or not at all.
 * @property {boolean} requiresCredential
 * @property {string[]} credentials    Which environment variables, if any.
 * @property {boolean} safeInCI        Whether an unattended run can do this.
 * @property {{cron: string, description: string, alsoOn: string, perSource: boolean}} cadence
 * @property {'discovered'|'none'} conditional
 * @property {{providerSupports: boolean, ingestible: boolean, reason: string}} webhook
 */

/**
 * Work out a source's refresh policy.
 *
 * @param {import('../../connectors/types.js').Connector|undefined} connector
 * @param {(name: string) => string|undefined} [env]  Reads a credential's presence, never its value.
 * @returns {RefreshPolicy}
 */
export function refreshPolicyFor(connector, env = () => undefined) {
  const fetches = typeof connector?.fetch === 'function'
  const credentials = connector?.authEnv ?? []
  // `token` availability means the API returns nothing at all without a credential. Anything
  // else with an `authEnv` merely works better with one, and must not be reported as blocked.
  const requiresCredential = connector?.availability === 'token'
  const missing = credentials.filter((name) => !env(name))

  const base = {
    requiresCredential,
    credentials,
    cadence: SCHEDULE,
    // Never declared per connector. A conditional request is sent only when the provider
    // itself supplied a validator on a previous response, so support is discovered at runtime
    // rather than asserted here — see `connectors/cache.js`.
    conditional: fetches ? 'discovered' : 'none',
    webhook: {
      providerSupports: PROVIDER_WEBHOOKS.has(connector?.id ?? ''),
      ingestible: false,
      reason: 'Nothing in this project can receive a webhook: the site is a static export and the admin API is local-only.',
    },
  }

  if (!fetches) {
    // Not a failure and not fixable. A platform that publishes nothing readable will never
    // refresh, and saying so plainly is better than an action that cannot work.
    return {
      ...base,
      mode: connector?.availability === 'url-only' ? 'unsupported' : 'manual',
      method: connector?.availability === 'url-only'
        ? 'A verified link only — there is nothing to fetch.'
        : 'Figures you supply yourself.',
      summary: connector?.availability === 'url-only'
        ? 'Never refreshes. This platform publishes nothing that can be read.'
        : 'Refreshes when you edit it. This platform has no readable interface.',
      safeInCI: false,
      conditional: 'none',
    }
  }

  if (requiresCredential && missing.length) {
    return {
      ...base,
      mode: 'blocked',
      method: 'An official API that returns nothing without a credential.',
      summary: `Cannot refresh until ${missing.join(' and ')} is set. It is read from the environment, never from the browser.`,
      safeInCI: false,
    }
  }

  return {
    ...base,
    mode: 'automatic',
    method: connector?.availability === 'feed'
      ? 'A public feed.'
      : requiresCredential
        ? 'An official API, using your credential.'
        : 'A public API.',
    summary: `Refreshes automatically — ${SCHEDULE.description}, and on every push to main.`,
    safeInCI: true,
  }
}

/**
 * Roll policies up for the whole set.
 *
 * The number worth showing is how much of the portfolio maintains itself, and the honest
 * denominator for that is every configured source — including the ones that never will.
 *
 * @param {RefreshPolicy[]} policies
 */
export function summarizeRefresh(policies) {
  const count = (mode) => policies.filter((policy) => policy.mode === mode).length
  return {
    automatic: count('automatic'),
    blocked: count('blocked'),
    manual: count('manual'),
    unsupported: count('unsupported'),
    total: policies.length,
    cadence: SCHEDULE,
  }
}
