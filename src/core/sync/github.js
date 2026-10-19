/**
 * GitHub, as a source of change events.
 *
 * Two doors lead to the same room. A **webhook** delivery is GitHub telling the service
 * something happened, signed and pushed. The **Events API** is the service asking, cheaply, with
 * an `ETag`, for what the account did lately. Both are reduced here to one provider-neutral
 * `ChangeEvent`, so everything after this file — dedupe, coalescing, publishing — neither knows
 * nor cares which door an event came through.
 *
 * ## What each door can see
 *
 * They are *not* equivalent, and pretending they were would be the dishonest version of this:
 *
 * - The Events API endpoint used here (`/users/{account}/events/public`) lists what the
 *   **account itself did**: pushes, repositories it created or published, releases it cut. It
 *   does **not** list what *other people* did to the account's repositories — a star or a fork
 *   from someone else never appears in it.
 * - A webhook delivers those too (`star`, `fork`), because it is scoped to the repositories the
 *   GitHub App is installed on, not to an actor.
 *
 * So polling covers the owner's own work, and only a webhook sees the audience's reactions.
 * Both are reported as capabilities, rather than one being implied to be the other.
 *
 * ## Privacy by construction
 *
 * The public endpoint cannot return private activity, and the webhook path drops any event from
 * a private repository. The exception is a repository *becoming* private, which matters because
 * it disappears from the portfolio.
 *
 * @module core/sync/github
 */

/**
 * @typedef {object} ChangeEvent
 * @property {string} id           Unique per delivery, so a redelivery is recognisably the same.
 * @property {'github'} source
 * @property {string} kind         e.g. `push`, `repository.created`, `star.created`, `release.published`.
 * @property {'structural'|'activity'} weight
 *   `structural` changes what the portfolio *contains* (a repository appears, is renamed,
 *   goes private, ships a release). `activity` changes numbers and recency (a push, a star).
 * @property {string} [repo]       `owner/name`.
 * @property {string} [account]
 * @property {string} [occurredAt] When it happened, by the provider's clock, if it said.
 * @property {string} receivedAt   When this service learned of it.
 * @property {'webhook'|'events-poll'} via
 */

/** The webhook events the GitHub App must subscribe to for everything below to work. */
export const GITHUB_WEBHOOK_EVENTS = Object.freeze([
  'push', 'repository', 'star', 'release', 'public', 'fork', 'workflow_run',
])

const REPOSITORY_ACTIONS = new Set([
  'created', 'deleted', 'publicized', 'privatized', 'renamed', 'edited',
  'transferred', 'archived', 'unarchived',
])

/** @param {unknown} value @returns {string|undefined} */
const iso = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString()
  if (typeof value !== 'string') return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/** @param {string|undefined} a @param {string|undefined} b */
const sameAccount = (a, b) => !a || !b || a.toLowerCase() === b.toLowerCase()

/**
 * @typedef {{type: 'ping'}
 *   | {type: 'ignored', reason: string}
 *   | {type: 'change', change: ChangeEvent}
 *   | {type: 'workflow', run: WorkflowRun}} WebhookOutcome
 *
 * @typedef {object} WorkflowRun
 * @property {number|string} id
 * @property {string} conclusion      `success`, `failure`, `cancelled`, …
 * @property {string} event           What started the run: `push`, `schedule`, `repository_dispatch`…
 * @property {string} [url]
 * @property {string} [createdAt]
 * @property {string} [completedAt]
 */

/**
 * Interpret one webhook delivery.
 *
 * @param {{event: string|null|undefined, delivery: string|null|undefined, payload: any,
 *   now: string, account?: string, workflowPath?: string}} input
 * @returns {WebhookOutcome}
 */
export function parseGitHubWebhook({ event, delivery, payload, now, account, workflowPath = 'deploy.yml' }) {
  if (event === 'ping') return { type: 'ping' }
  if (!event || !payload || typeof payload !== 'object') {
    return { type: 'ignored', reason: 'malformed' }
  }

  if (event === 'workflow_run') {
    const run = payload.workflow_run
    if (payload.action !== 'completed' || !run) return { type: 'ignored', reason: 'workflow-not-completed' }
    if (!String(run.path ?? '').endsWith(workflowPath)) return { type: 'ignored', reason: 'other-workflow' }
    const branch = payload.repository?.default_branch
    if (branch && run.head_branch !== branch) return { type: 'ignored', reason: 'other-branch' }
    return {
      type: 'workflow',
      run: {
        id: run.id,
        conclusion: String(run.conclusion ?? ''),
        event: String(run.event ?? ''),
        url: typeof run.html_url === 'string' ? run.html_url : undefined,
        createdAt: iso(run.created_at),
        completedAt: iso(run.updated_at),
      },
    }
  }

  if (!delivery) return { type: 'ignored', reason: 'no-delivery-id' }

  const repository = payload.repository
  const owner = repository?.owner?.login
  if (!sameAccount(owner, account)) return { type: 'ignored', reason: 'other-account' }

  /** @param {Partial<ChangeEvent> & {kind: string, weight: ChangeEvent['weight']}} extra @returns {WebhookOutcome} */
  const change = (extra) => ({
    type: 'change',
    change: {
      id: String(delivery),
      source: 'github',
      repo: repository?.full_name,
      account: owner,
      receivedAt: now,
      via: 'webhook',
      ...extra,
    },
  })

  // `privatized` is the one case where a private repository is the news: it just left the site.
  const privatizing = event === 'repository' && payload.action === 'privatized'
  if (repository?.private === true && !privatizing) {
    return { type: 'ignored', reason: 'private-repository' }
  }

  switch (event) {
    case 'push': {
      if (payload.deleted) return { type: 'ignored', reason: 'branch-deleted' }
      // Only the default branch: a feature branch is not the repository changing.
      if (payload.ref !== `refs/heads/${repository?.default_branch}`) {
        return { type: 'ignored', reason: 'not-default-branch' }
      }
      return change({
        kind: 'push',
        weight: 'activity',
        occurredAt: iso(payload.head_commit?.timestamp) ?? iso(repository?.pushed_at),
      })
    }

    case 'repository': {
      if (!REPOSITORY_ACTIONS.has(payload.action)) return { type: 'ignored', reason: 'repository-action' }
      return change({
        kind: `repository.${payload.action}`,
        weight: 'structural',
        occurredAt: iso(repository?.updated_at),
      })
    }

    case 'public':
      return change({ kind: 'repository.publicized', weight: 'structural', occurredAt: iso(repository?.updated_at) })

    case 'release': {
      if (!['published', 'unpublished', 'deleted'].includes(payload.action)) {
        return { type: 'ignored', reason: 'release-action' }
      }
      return change({
        kind: `release.${payload.action}`,
        weight: 'structural',
        occurredAt: iso(payload.release?.published_at),
      })
    }

    case 'star': {
      if (!['created', 'deleted'].includes(payload.action)) return { type: 'ignored', reason: 'star-action' }
      return change({ kind: `star.${payload.action}`, weight: 'activity', occurredAt: iso(payload.starred_at) })
    }

    case 'fork':
      return change({ kind: 'fork', weight: 'activity', occurredAt: iso(payload.forkee?.created_at) })

    default:
      return { type: 'ignored', reason: 'unsubscribed-event' }
  }
}

/**
 * Interpret a page of the Events API.
 *
 * Returns only events that can change a portfolio, in the order GitHub sent them — which is
 * neither id order nor time order (see `poller.js`). The id carries GitHub's own event id, so
 * seeing the same event on two polls is recognisable as such.
 *
 * @param {any[]} events
 * @param {{now: string, account?: string}} context
 * @returns {ChangeEvent[]}
 */
export function parsePolledGitHubEvents(events, { now, account }) {
  if (!Array.isArray(events)) return []
  /** @type {ChangeEvent[]} */
  const out = []

  for (const event of events) {
    if (!event || typeof event !== 'object' || event.public === false) continue
    const actor = event.actor?.login
    if (!sameAccount(actor, account)) continue

    const base = {
      id: `gh-event:${event.id}`,
      source: /** @type {const} */ ('github'),
      repo: typeof event.repo?.name === 'string' ? event.repo.name : undefined,
      account: actor,
      occurredAt: iso(event.created_at),
      receivedAt: now,
      via: /** @type {const} */ ('events-poll'),
    }

    switch (event.type) {
      case 'PushEvent':
        out.push({ ...base, kind: 'push', weight: 'activity' })
        break
      case 'CreateEvent':
        // Branches and tags are not a repository appearing.
        if (event.payload?.ref_type === 'repository') {
          out.push({ ...base, kind: 'repository.created', weight: 'structural' })
        }
        break
      case 'PublicEvent':
        out.push({ ...base, kind: 'repository.publicized', weight: 'structural' })
        break
      case 'ReleaseEvent':
        if (event.payload?.action === 'published') {
          out.push({ ...base, kind: 'release.published', weight: 'structural' })
        }
        break
      default:
        break
    }
  }

  return out
}
