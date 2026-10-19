/**
 * Asking the repository to rebuild the site.
 *
 * `repository_dispatch` is the right lever for this and the reason is a permission, not a
 * preference: it needs only `contents: write`, which the existing GitHub App already holds
 * (`workers/admin`), where `workflow_dispatch` would need `actions: write`, a permission the
 * admin Worker's README explicitly says it does not have. Triggering a build should not widen
 * what the App is allowed to do.
 *
 * The request carries *no profile data*, only a count and a few delivery ids for the run log:
 * the build re-reads everything from the providers, so there is nothing to send.
 *
 * Never throws. A publisher that throws would lose the batch it was publishing; the ledger turns
 * every failure into a retry instead, and needs a value to do it with.
 *
 * @module core/sync/publish
 */

import { safeText } from './ledger.js'

export const EVENT_TYPE = 'profile-changed'

/**
 * @param {{repository: string, getToken: () => Promise<string>, fetch?: typeof fetch,
 *   eventType?: string}} deps
 * @returns {import('./ledger.js').Publish}
 */
export function createRepositoryDispatchPublisher({
  repository, getToken, fetch: doFetch = fetch, eventType = EVENT_TYPE,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`repository must be "owner/name", got "${repository}"`)
  }

  return async function publish({ source, events, ids, kinds }) {
    let token
    try {
      token = await getToken()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `could not get a repository token: ${safeText(reason)}` }
    }

    let response
    try {
      response = await doFetch(`https://api.github.com/repos/${repository}/dispatches`, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'portfolio-sync/1.0',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: eventType,
          client_payload: { source, events, kinds, sample: ids.slice(0, 5) },
        }),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `network error: ${safeText(reason)}` }
    }

    // GitHub answers 204 No Content on success.
    if (response.status === 204) return { ok: true, status: 204 }

    const retryAfter = Number(response.headers.get('retry-after'))
    return {
      ok: false,
      status: response.status,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {}),
      error: `GitHub refused the dispatch (HTTP ${response.status})`,
    }
  }
}
