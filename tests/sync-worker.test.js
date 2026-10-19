import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

import worker from '../workers/sync/src/index.js'
import { createMemoryStore } from '../src/core/sync/store.js'
import { POLL_HEARTBEAT_MS, createSyncService } from '../src/core/sync/service.js'
import { signSha256 } from '../src/core/sync/signature.js'

/**
 * The sync Worker, exercised through its actual `fetch` and `scheduled` handlers.
 *
 * `sync-ledger.test.js` tests the decisions; this tests the *host*: real `Request` and
 * `Response` objects through the routing, the configuration checks, the CORS handling and the
 * cron entry point. Everything a Worker needs — Web Crypto, `Request`, `Response`, `Headers` —
 * is a Web API Node has, so nothing is emulated and only the network is stubbed.
 *
 * ## Real versus stubbed
 *
 * - **Real:** RSA key generation and the App JWT signature, HMAC verification, routing, body
 *   handling, KV semantics (TTL, JSON round-trip), the exact `repository_dispatch` request.
 * - **Stubbed:** GitHub. `globalThis.fetch` is replaced by a script that records every call and
 *   *fails loudly* on anything unscripted, so a request that unexpectedly reaches the network
 *   fails the test instead of passing quietly.
 *
 * What this cannot show is that GitHub really delivers these events to a deployed Worker. That
 * needs the owner's Cloudflare account and App settings; see `docs/sync-service.md`.
 */

const WEBHOOK_SECRET = 'whsec-' + 'a'.repeat(40)
const ORIGIN = 'https://ada.github.io'

async function generatePkcs8Pem() {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const der = await crypto.subtle.exportKey('pkcs8', privateKey)
  const body = Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

/** A KV namespace with the semantics the adapter relies on, and a write counter. */
function fakeKv() {
  const entries = new Map()
  const kv = {
    writes: 0,
    async get(key, type) {
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt && entry.expiresAt <= Date.now()) { entries.delete(key); return null }
      return type === 'json' ? JSON.parse(entry.value) : entry.value
    },
    async put(key, value, options) {
      kv.writes += 1
      entries.set(key, { value, expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined })
    },
    async delete(key) { entries.delete(key) },
    keys: () => [...entries.keys()],
  }
  return kv
}

let env
let network
const realFetch = globalThis.fetch

before(async () => {
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body }
    network.calls.push(call)
    const handler = network.routes.find((route) => route.match(call))
    if (!handler) throw new Error(`unscripted network call: ${call.method} ${call.url}`)
    return handler.respond(call)
  }
})
after(() => { globalThis.fetch = realFetch })

let privateKey
before(async () => { privateKey = await generatePkcs8Pem() })

beforeEach(() => {
  network = { calls: [], routes: [] }
  env = {
    SYNC_KV: fakeKv(),
    REPOSITORY: 'ada/engine',
    ACCOUNT: 'ada',
    ADMIN_ORIGIN: ORIGIN,
    GITHUB_APP_ID: '123',
    GITHUB_PRIVATE_KEY: privateKey,
    GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    POLL_ENABLED: 'true',
  }
})

/** Script the three GitHub calls a successful dispatch makes. */
function scriptDispatch({ installed = true, dispatchStatus = 204 } = {}) {
  network.routes.push(
    {
      match: (c) => c.url === 'https://api.github.com/repos/ada/engine/installation',
      respond: () => installed
        ? new Response(JSON.stringify({ id: 42 }), { status: 200 })
        : new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    },
    {
      match: (c) => c.url === 'https://api.github.com/app/installations/42/access_tokens',
      respond: () => new Response(JSON.stringify({ token: 'ghs_installationtoken_for_tests' }), { status: 201 }),
    },
    {
      match: (c) => c.url === 'https://api.github.com/repos/ada/engine/dispatches',
      respond: () => new Response(null, { status: dispatchStatus }),
    },
  )
}

const repository = {
  full_name: 'ada/engine', owner: { login: 'ada' }, default_branch: 'main', private: false,
  updated_at: new Date().toISOString(),
}

async function post(path, { event, delivery, payload, secret = WEBHOOK_SECRET, contentType = 'application/json', headers = {}, rawBody } = {}) {
  const body = rawBody ?? JSON.stringify(payload ?? {})
  return worker.fetch(
    new Request(`https://sync.test${path}`, {
      method: 'POST',
      body,
      headers: {
        'content-type': contentType,
        'x-github-event': event ?? 'repository',
        'x-github-delivery': delivery ?? crypto.randomUUID(),
        'x-hub-signature-256': await signSha256(secret, body),
        ...headers,
      },
    }),
    env,
  )
}

/* The webhook, end to end -------------------------------------------------------- */

describe('POST /hooks/github', () => {
  test('a signed event becomes a repository_dispatch, authenticated as the App installation', async () => {
    scriptDispatch()
    const response = await post('/hooks/github', {
      event: 'repository', delivery: 'abc-1', payload: { action: 'created', repository },
    })
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { ok: true, outcome: 'dispatched' })

    assert.deepEqual(network.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`), [
      'GET /repos/ada/engine/installation',
      'POST /app/installations/42/access_tokens',
      'POST /repos/ada/engine/dispatches',
    ])

    // The lookup is authenticated as the App itself, with a genuinely signed three-part JWT.
    const jwt = network.calls[0].headers.authorization.replace('Bearer ', '')
    assert.equal(jwt.split('.').length, 3)
    assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).iss, '123')

    // The token request narrows to one repository and to contents:write — nothing wider.
    assert.deepEqual(JSON.parse(network.calls[1].body), { repositories: ['engine'], permissions: { contents: 'write' } })

    // And the dispatch itself uses the *installation* token, not the JWT.
    const dispatch = network.calls[2]
    assert.equal(dispatch.headers.authorization, 'Bearer ghs_installationtoken_for_tests')
    const sent = JSON.parse(dispatch.body)
    assert.equal(sent.event_type, 'profile-changed')
    assert.equal(sent.client_payload.source, 'github')
    assert.equal(sent.client_payload.kinds['repository.created'], 1)
  })

  test('a replayed delivery is recognised and causes no second build', async () => {
    scriptDispatch()
    const args = { event: 'repository', delivery: 'replayed', payload: { action: 'created', repository } }
    await post('/hooks/github', args)
    const callsAfterFirst = network.calls.length
    const again = await post('/hooks/github', args)
    assert.deepEqual(await again.json(), { ok: true, outcome: 'duplicate' })
    assert.equal(network.calls.length, callsAfterFirst, 'a duplicate must not touch GitHub at all')
  })

  test('a forged request is refused with no network call and no detail', async () => {
    const response = await post('/hooks/github', {
      event: 'repository', payload: { action: 'created', repository }, secret: 'attacker-guess',
    })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'invalid-signature' })
    assert.equal(network.calls.length, 0)
  })

  test('a request with no signature at all is refused', async () => {
    const response = await worker.fetch(
      new Request('https://sync.test/hooks/github', {
        method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      }),
      env,
    )
    assert.equal(response.status, 401)
  })

  test('a deployment with no webhook secret refuses everything, rather than accepting everything', async () => {
    delete env.GITHUB_WEBHOOK_SECRET
    const response = await post('/hooks/github', { event: 'repository', payload: { action: 'created', repository } })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'webhook-not-configured' })
    assert.equal(network.calls.length, 0)
  })

  test('form-encoded deliveries are refused with a reason the owner can find in GitHub\'s log', async () => {
    const response = await post('/hooks/github', { contentType: 'application/x-www-form-urlencoded', rawBody: 'payload=%7B%7D' })
    assert.equal(response.status, 415)
    assert.match((await response.json()).error, /application\/json/)
  })

  test('an oversized body is refused before it is read', async () => {
    const response = await post('/hooks/github', { headers: { 'content-length': String(6 * 1024 * 1024) }, payload: {} })
    assert.equal(response.status, 413)
    assert.equal(network.calls.length, 0)
  })

  test('uninteresting events answer 200 so GitHub shows a healthy delivery', async () => {
    const ping = await post('/hooks/github', { event: 'ping', payload: { zen: 'Keep it logically awesome.' } })
    assert.deepEqual([ping.status, await ping.json()], [200, { ok: true, pong: true }])
    const other = await post('/hooks/github', { event: 'issues', payload: { repository } })
    assert.deepEqual([other.status, await other.json()], [200, { ok: true, ignored: 'unsubscribed-event' }])
    assert.equal(network.calls.length, 0)
  })

  test('a failed dispatch still answers 202 — the event was accepted — and is visible in status', async () => {
    scriptDispatch({ installed: false })
    const response = await post('/hooks/github', { event: 'repository', payload: { action: 'created', repository } })
    assert.equal(response.status, 202)
    assert.equal((await response.json()).outcome, 'failed')

    const status = await (await worker.fetch(new Request('https://sync.test/sync/status'), env)).json()
    assert.equal(status.pending.count, 1, 'the change is waiting to be retried, not lost')
    assert.match(status.lastFailure.error, /not installed/)
  })

  test('the deploy finishing is recorded, giving observed latency', async () => {
    scriptDispatch()
    await post('/hooks/github', { event: 'repository', payload: { action: 'created', repository } })
    const done = await post('/hooks/github', {
      event: 'workflow_run',
      payload: {
        action: 'completed', repository,
        workflow_run: {
          id: 9, path: '.github/workflows/deploy.yml', head_branch: 'main', event: 'repository_dispatch',
          conclusion: 'success', updated_at: new Date(Date.now() + 175_000).toISOString(),
        },
      },
    })
    assert.equal(done.status, 200)
    const status = await (await worker.fetch(new Request('https://sync.test/sync/status'), env)).json()
    assert.equal(status.lastPublish.conclusion, 'success')
    assert.ok(status.lastPublish.latencyMs > 170_000 && status.lastPublish.latencyMs < 180_000)
  })
})

/* Status, CORS, routing ---------------------------------------------------------- */

describe('GET /sync/status', () => {
  test('is readable by the admin origin only, and never cached', async () => {
    const response = await worker.fetch(new Request('https://sync.test/sync/status'), env)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
  })

  test('without an ADMIN_ORIGIN it grants no cross-origin access at all', async () => {
    delete env.ADMIN_ORIGIN
    const response = await worker.fetch(new Request('https://sync.test/sync/status'), env)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })

  test('answers the browser\'s preflight', async () => {
    const response = await worker.fetch(new Request('https://sync.test/sync/status', { method: 'OPTIONS' }), env)
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN)
  })

  test('contains no secret, key or token, even after a failed dispatch that touched them', async () => {
    scriptDispatch({ dispatchStatus: 500 })
    await post('/hooks/github', { event: 'repository', payload: { action: 'created', repository } })
    const text = await (await worker.fetch(new Request('https://sync.test/sync/status'), env)).text()
    for (const secret of [WEBHOOK_SECRET, privateKey, 'ghs_installationtoken', 'BEGIN PRIVATE KEY', 'Bearer ']) {
      assert.ok(!text.includes(secret), `status leaked: ${secret.slice(0, 12)}…`)
    }
  })

  test('reports configured-but-unobserved honestly on a fresh deployment', async () => {
    const status = await (await worker.fetch(new Request('https://sync.test/sync/status'), env)).json()
    assert.equal(status.mechanisms.webhook.configured, true)
    assert.equal(status.mechanisms.webhook.lastSeenAt, null)
    assert.equal(status.mechanisms.eventsPoll.lastSeenAt, null)
  })
})

describe('routing and configuration', () => {
  test('unknown paths and wrong methods are 404', async () => {
    for (const [method, path] of [['GET', '/'], ['GET', '/hooks/github'], ['POST', '/sync/status'], ['GET', '/admin']]) {
      const response = await worker.fetch(new Request(`https://sync.test${path}`, { method }), env)
      assert.equal(response.status, 404, `${method} ${path}`)
    }
  })

  test('missing configuration is named, not hidden behind a generic error', async () => {
    for (const name of ['REPOSITORY', 'GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY']) {
      const broken = { ...env }
      delete broken[name]
      const response = await worker.fetch(new Request('https://sync.test/sync/status'), broken)
      assert.equal(response.status, 500)
      assert.match((await response.json()).error, new RegExp(name))
    }
    const noKv = { ...env }
    delete noKv.SYNC_KV
    assert.match((await (await worker.fetch(new Request('https://sync.test/sync/status'), noKv)).json()).error, /SYNC_KV/)
  })

  test('a malformed repository is refused before anything can be sent to it', async () => {
    const response = await worker.fetch(new Request('https://sync.test/sync/status'), { ...env, REPOSITORY: '../../etc' })
    assert.equal(response.status, 500)
    assert.match((await response.json()).error, /owner\/name/)
  })

  test('an unexpected failure is reported generically and the detail stays in the log', async () => {
    const broken = { ...env, SYNC_KV: { get: async () => { throw new Error('kv exploded with a secret: ' + WEBHOOK_SECRET) } } }
    const original = console.error
    console.error = () => {}
    try {
      const response = await worker.fetch(new Request('https://sync.test/sync/status'), broken)
      assert.equal(response.status, 500)
      const text = await response.text()
      assert.ok(!text.includes(WEBHOOK_SECRET))
      assert.equal(JSON.parse(text).error, 'internal-error')
    } finally {
      console.error = original
    }
  })
})

/* The cron ----------------------------------------------------------------------- */

describe('scheduled', () => {
  const run = async () => {
    const pending = []
    await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) })
    await Promise.all(pending)
  }
  const eventsRoute = (events, headers = { etag: 'W/"1"', 'x-poll-interval': '60' }) => network.routes.push({
    match: (c) => c.url.startsWith('https://api.github.com/users/ada/events/public'),
    respond: () => new Response(JSON.stringify(events), { status: 200, headers }),
  })
  const ev = (id, type, payload = {}) => ({
    id: String(id), type, public: true, actor: { login: 'ada' },
    repo: { name: 'ada/engine' }, created_at: new Date().toISOString(), payload,
  })

  test('establishes a baseline first, then publishes what appears after it — no webhook involved', async () => {
    scriptDispatch()
    eventsRoute([ev(100, 'PushEvent')])
    await run()
    assert.equal(network.calls.filter((c) => c.url.endsWith('/dispatches')).length, 0, 'the baseline is not news')

    // Let the baseline's nextPollAt pass, then show a new repository.
    const poll = await env.SYNC_KV.get('sync:poll:github', 'json')
    await env.SYNC_KV.put('sync:poll:github', JSON.stringify({ ...poll, nextPollAt: new Date(Date.now() - 1000).toISOString() }))
    network.routes.length = 0
    scriptDispatch()
    eventsRoute([ev(101, 'CreateEvent', { ref_type: 'repository' }), ev(100, 'PushEvent')], { etag: 'W/"2"', 'x-poll-interval': '60' })
    await run()

    assert.equal(network.calls.filter((c) => c.url.endsWith('/dispatches')).length, 1)
    const status = await (await worker.fetch(new Request('https://sync.test/sync/status'), env)).json()
    assert.equal(status.lastVia, 'events-poll')
    assert.equal(status.mechanisms.eventsPoll.lastSeenAt !== null, true)
  })

  test('polling can be switched off, leaving webhooks alone', async () => {
    env.POLL_ENABLED = 'false'
    await run()
    assert.equal(network.calls.length, 0, 'a disabled poll must not touch GitHub')
  })

  test('an exception inside a tick is contained, not thrown into the runtime', async () => {
    env.SYNC_KV = { get: async () => { throw new Error('boom') } }
    const original = console.error
    console.error = () => {}
    try {
      await assert.doesNotReject(run())
    } finally {
      console.error = original
    }
  })

  test('passes the optional poll token to GitHub, and only to GitHub', async () => {
    env.GITHUB_POLL_TOKEN = 'ghp_polltoken_for_tests_only'
    eventsRoute([ev(1, 'PushEvent')])
    await run()
    const call = network.calls.find((c) => c.url.includes('/events/public'))
    assert.equal(call.headers.authorization, 'Bearer ghp_polltoken_for_tests_only')
    assert.ok(!call.url.includes('ghp_'))
  })
})

/* The free-tier budget ----------------------------------------------------------- */

describe('KV write budget', () => {
  // Cloudflare KV's free tier allows 1,000 writes a day. The cron fires every minute, so an
  // idle service must not write on each tick: 1,440 ticks a day would be 1,440 writes on its
  // own. This is the property that keeps "free" true.
  test('a day of idle ticks costs a small, bounded number of writes', async () => {
    let t = Date.parse('2026-10-19T00:00:00Z')
    const base = createMemoryStore({ now: () => t })
    let writes = 0
    const store = { get: (k) => base.get(k), delete: (k) => base.delete(k), put: (k, v, o) => { writes += 1; return base.put(k, v, o) } }

    const service = createSyncService({
      store, account: 'ada', webhookSecret: 's', now: () => t, random: () => 0,
      publish: async () => ({ ok: true }),
      fetch: async (_url, options) => {
        // The first request establishes a baseline (200); every later one is a 304.
        if (options.headers['if-none-match']) return new Response(null, { status: 304, headers: { 'x-poll-interval': '60' } })
        return new Response(JSON.stringify([{ id: '1', type: 'PushEvent', public: true, actor: { login: 'ada' }, repo: { name: 'a/b' }, created_at: new Date(t).toISOString() }]),
          { status: 200, headers: { etag: 'W/"1"', 'x-poll-interval': '60' } })
      },
    })

    for (let minute = 0; minute < 24 * 60; minute += 1) {
      await service.tick()
      t += 60_000
    }

    const ceiling = Math.ceil((24 * 60 * 60_000) / POLL_HEARTBEAT_MS) + 5
    assert.ok(writes <= ceiling, `${writes} writes in a day of idle ticks; the budget is ${ceiling} (KV free tier: 1,000)`)
    assert.ok(writes >= 100, 'the heartbeat must still run, or "polling is working" would go stale in the UI')
  })

  test('idle ticks with nothing pending write nothing at all', async () => {
    const t = Date.parse('2026-10-19T00:00:00Z')
    const base = createMemoryStore({ now: () => t })
    let writes = 0
    const store = { get: (k) => base.get(k), delete: (k) => base.delete(k), put: (k, v, o) => { writes += 1; return base.put(k, v, o) } }
    const service = createSyncService({
      store, account: 'ada', webhookSecret: 's', pollEnabled: false, now: () => t,
      publish: async () => ({ ok: true }),
    })
    for (let i = 0; i < 100; i += 1) await service.tick()
    assert.equal(writes, 0)
  })
})
