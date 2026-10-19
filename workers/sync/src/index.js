/**
 * The sync service, as a Cloudflare Worker.
 *
 * This file is a router. Every behaviour that matters — verifying a delivery, deduplicating it,
 * coalescing a burst, polling, retrying, recording whether the site actually rebuilt — lives in
 * `src/core/sync/` and is tested there under Node. What is here is the part that is specific to
 * *this host*: reading `env`, turning a `Request` into the service's plain inputs and its result
 * back into a `Response`, and the cron entry point.
 *
 * Routes:
 *
 *   POST /hooks/github   GitHub webhook deliveries. Signature-verified; nothing is parsed first.
 *   GET  /sync/status    What is safe to show: counts, times, short messages. No payloads.
 *   (cron, every minute) Publish anything waiting; poll GitHub's Events API when due.
 *
 * It is a separate Worker from `workers/admin` on purpose. That one is deliberately stateless —
 * its README's point is that sessions are signed cookies and GitHub is the database — while sync
 * has to remember delivery ids, a coalescing window and a status record, so it gets exactly one
 * KV binding and nothing else.
 *
 * @module workers/sync
 */

import { findInstallation, installationToken } from '../../admin/src/github.js'
import { MAX_BODY_BYTES, createSyncService } from '../../../src/core/sync/service.js'
import { createRepositoryDispatchPublisher } from '../../../src/core/sync/publish.js'
import { createKvStore } from '../../../src/core/sync/store.js'

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   */
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS' && url.pathname === '/sync/status') return preflight(env)

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /hooks/github': return await webhook(request, env)
        case 'GET /sync/status': return await status(env)
        default: return json({ error: 'not-found' }, 404)
      }
    } catch (error) {
      // Logged for the owner (`wrangler tail`); never echoed to the caller, whose only
      // legitimate use of this URL is GitHub's delivery log.
      console.error(error)
      return json({ error: error instanceof ConfigError ? error.message : 'internal-error' }, 500)
    }
  },

  /**
   * The cron entry point. `waitUntil` so the invocation is not cut short when the response
   * (there is none) would have been returned.
   *
   * @param {unknown} _event
   * @param {Record<string, any>} env
   * @param {{waitUntil: (p: Promise<unknown>) => void}} ctx
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const result = await service(env).tick()
          // One line per tick, and only when something happened — idle ticks are the norm.
          if (result.polled.changes || result.flushed.dispatched || result.flushed.failed) {
            console.log(JSON.stringify(result))
          }
        } catch (error) {
          console.error(error)
        }
      })(),
    )
  },
}

/* Routes ------------------------------------------------------------------------- */

/** @param {Request} request @param {Record<string, any>} env */
async function webhook(request, env) {
  // GitHub can be configured to send form-encoded bodies. Refusing them says why in the
  // delivery log, which is where someone setting this up will be looking.
  if (!String(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    return json({ error: 'content-type-must-be-application/json' }, 415)
  }
  // Refused before the body is read, so an oversized request costs a header, not memory.
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: 'too-large' }, 413)

  const rawBody = await request.text()
  const { status: code, body } = await service(env).handleWebhook({ rawBody, headers: request.headers })
  return json(body, code)
}

/** @param {Record<string, any>} env */
async function status(env) {
  return json(await service(env).status(), 200, env)
}

/* Assembly ----------------------------------------------------------------------- */

/**
 * Build the service from `env`. Per request: construction is cheap, and a Worker has no
 * long-lived state of its own to hold it in.
 *
 * @param {Record<string, any>} env
 */
function service(env) {
  const config = settings(env)
  const app = { appId: config.appId, privateKey: config.privateKey }
  const [owner, repo] = config.repository.split('/')

  const publish = createRepositoryDispatchPublisher({
    repository: config.repository,
    // Minted only when a publish is actually attempted — at most once per cooldown — rather
    // than on every webhook, and never stored. A token at rest is a token that can leak.
    getToken: async () => {
      const installation = await findInstallation(app, owner, repo)
      if (!installation) throw new Error('The GitHub App is not installed on this repository.')
      return installationToken(app, installation.id, repo)
    },
  })

  return createSyncService({
    store: createKvStore(env.SYNC_KV),
    publish,
    account: config.account,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    pollEnabled: config.pollEnabled,
    token: env.GITHUB_POLL_TOKEN,
    ledgerOptions: config.cooldownMs ? { cooldownMs: config.cooldownMs } : undefined,
  })
}

class ConfigError extends Error {}

/**
 * Read and check configuration. A missing value is reported as one — the likeliest time for
 * this to be wrong is the first five minutes of someone's setup, which is exactly when a clear
 * message is worth most.
 *
 * `GITHUB_WEBHOOK_SECRET` is *not* required here: its absence is handled inside the service,
 * which refuses every webhook (503) rather than accepting them, and a status request should
 * still work on a half-configured deployment so the owner can see what is missing.
 *
 * @param {Record<string, any>} env
 */
function settings(env) {
  for (const name of ['REPOSITORY', 'GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY']) {
    if (!env[name]) throw new ConfigError(`${name} is not set.`)
  }
  if (!env.SYNC_KV) throw new ConfigError('The SYNC_KV namespace is not bound. See workers/sync/wrangler.toml.')
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.REPOSITORY)) {
    throw new ConfigError('REPOSITORY must be "owner/name".')
  }
  const cooldown = Number(env.COOLDOWN_SECONDS)
  return {
    repository: env.REPOSITORY,
    account: env.ACCOUNT || env.REPOSITORY.split('/')[0],
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
    pollEnabled: String(env.POLL_ENABLED ?? 'true').toLowerCase() !== 'false',
    cooldownMs: Number.isFinite(cooldown) && cooldown >= 0 && env.COOLDOWN_SECONDS !== undefined ? cooldown * 1000 : undefined,
  }
}

/* HTTP helpers ------------------------------------------------------------------- */

/**
 * The admin page is served from GitHub Pages and this Worker from workers.dev, so reading the
 * status is cross-origin. Pinned to one origin and never `*`. The status holds nothing secret,
 * but a wildcard is a habit worth not having.
 *
 * @param {Record<string, any>} [env]
 */
function corsHeaders(env) {
  let origin
  try {
    origin = env?.ADMIN_ORIGIN ? new URL(env.ADMIN_ORIGIN).origin : undefined
  } catch {
    origin = undefined
  }
  return origin
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : {}
}

/** @param {Record<string, any>} env */
function preflight(env) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(env),
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-max-age': '600',
    },
  })
}

/** @param {unknown} body @param {number} [status] @param {Record<string, any>} [env] */
function json(body, status = 200, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeaders(env),
    },
  })
}
