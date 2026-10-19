import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DEFAULTS, createSyncLedger, safeText } from '../src/core/sync/ledger.js'
import { createMemoryStore } from '../src/core/sync/store.js'
import { createRepositoryDispatchPublisher, EVENT_TYPE } from '../src/core/sync/publish.js'
import { createSyncService, MAX_BODY_BYTES } from '../src/core/sync/service.js'
import { signSha256 } from '../src/core/sync/signature.js'
import { classify } from '../src/core/sync/policy.js'

/**
 * The sync ledger and the service built on it, driven by a fake clock and a scripted publisher.
 *
 * Everything here is deterministic: time is a variable, "random" is a constant, the publisher is
 * a function that returns what the test tells it to. That is what makes it possible to assert
 * the behaviours that are otherwise only visible in production, a bad week at a time —
 * a retry that arrives too early, a duplicate that is built twice, a failed deploy that nobody
 * retries.
 *
 * All of this is *contract* testing: nothing here touches GitHub. What GitHub actually sends and
 * how it actually behaves is checked in `sync-live.test.js`.
 */

const T0 = Date.parse('2026-10-19T12:00:00.000Z')
const SECOND = 1000
const MINUTE = 60 * SECOND

/**
 * A harness: a clock, a store, a publisher that records calls, and a ledger over them.
 *
 * `random` defaults to just under 1, i.e. the *longest* jittered delay. A value of 0 would make
 * full-jitter backoff exactly zero, and a retry-too-early test could never observe an early retry.
 */
function harness({ responses, options, random = () => 0.999 } = {}) {
  let t = T0
  const clock = {
    now: () => t,
    advance: (ms) => { t += ms },
  }
  const store = createMemoryStore({ now: clock.now })
  const calls = []
  let n = 0
  const publish = async (request) => {
    calls.push({ ...request, at: t })
    const next = responses ? responses[Math.min(n, responses.length - 1)] : { ok: true, status: 204 }
    n += 1
    if (next instanceof Error) throw next
    return next
  }
  const ledger = createSyncLedger({ store, publish, now: clock.now, random, options })
  return { ledger, store, calls, clock }
}

let counter = 0
const change = (over = {}) => {
  counter += 1
  return {
    id: `d-${counter}`, source: 'github', kind: 'repository.created', weight: 'structural',
    repo: 'ada/engine', account: 'ada', receivedAt: new Date(T0).toISOString(), via: 'webhook',
    ...over,
  }
}
const activity = (over = {}) => change({ kind: 'push', weight: 'activity', ...over })

/* Coalescing -------------------------------------------------------------------- */

describe('publishing', () => {
  test('a structural change publishes immediately — the leading edge', async () => {
    const { ledger, calls } = harness()
    const [result] = await ledger.handle([change()])
    assert.equal(result.outcome, 'dispatched')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].events, 1)
  })

  test('a burst becomes one publish now and one later, not one per event', async () => {
    const { ledger, calls, clock } = harness()
    const first = await ledger.handle([change()])
    clock.advance(10 * SECOND)
    const rest = await ledger.handle([change(), change(), change(), change()])

    assert.equal(first[0].outcome, 'dispatched')
    assert.deepEqual(rest.map((r) => r.outcome), ['coalesced', 'coalesced', 'coalesced', 'coalesced'])
    assert.equal(calls.length, 1, 'the cooldown held the rest back')

    clock.advance(DEFAULTS.cooldownMs)
    await ledger.flush()
    assert.equal(calls.length, 2, 'the trailing publish carries everything that waited')
    assert.equal(calls[1].events, 4)
  })

  test('flush does nothing early, and nothing when idle', async () => {
    const { ledger, calls, clock } = harness()
    assert.deepEqual(await ledger.flush(), { skipped: 'nothing-pending' })
    await ledger.handle([change()])
    await ledger.handle([change()])
    clock.advance(DEFAULTS.cooldownMs - SECOND)
    assert.deepEqual(await ledger.flush(), { skipped: 'cooldown' })
    assert.equal(calls.length, 1)
  })

  test('activity is deferred, then published once, and a later structural change upgrades it', async () => {
    const { ledger, calls, clock } = harness()
    const [a] = await ledger.handle([activity()])
    assert.equal(a.outcome, 'coalesced', 'a push alone waits')
    assert.equal(calls.length, 0)

    clock.advance(DEFAULTS.deferMs - SECOND)
    assert.deepEqual(await ledger.flush(), { skipped: 'deferred' })

    clock.advance(2 * SECOND)
    assert.deepEqual(await ledger.flush(), { dispatched: true })
    assert.equal(calls.length, 1)

    // And a structural change among deferred ones publishes without waiting out the window.
    const second = harness()
    await second.ledger.handle([activity(), activity()])
    const [s] = await second.ledger.handle([change()])
    assert.equal(s.outcome, 'dispatched')
    assert.equal(second.calls[0].events, 3)
  })

  test('the batch records what kinds of change it carries', async () => {
    const { ledger, calls } = harness()
    await ledger.handle([change({ kind: 'repository.created' }), change({ kind: 'repository.created' }), change({ kind: 'star.created' })])
    assert.deepEqual(calls[0].kinds, { 'repository.created': 2, 'star.created': 1 })
  })
})

/* Duplicates, ordering, coverage ------------------------------------------------ */

describe('idempotency', () => {
  test('a redelivered event is recognised and never publishes twice', async () => {
    const { ledger, calls, clock } = harness()
    const e = change({ id: 'delivery-abc' })
    const [first] = await ledger.handle([e])
    clock.advance(DEFAULTS.cooldownMs * 3)
    const [again] = await ledger.handle([{ ...e }])

    assert.equal(first.outcome, 'dispatched')
    assert.equal(again.outcome, 'duplicate')
    assert.equal(calls.length, 1)
    assert.equal((await ledger.status()).counters.duplicates, 1)
  })

  test('the same id twice in one batch counts once', async () => {
    const { ledger, calls } = harness()
    const e = change({ id: 'same' })
    const results = await ledger.handle([e, e])
    assert.deepEqual(results.map((r) => r.outcome), ['dispatched', 'duplicate'])
    assert.equal(calls[0].events, 1)
  })

  test('an id is forgotten after its TTL, so the memory is bounded', async () => {
    const { ledger, clock, store } = harness({ options: { dedupeTtlSeconds: 120 } })
    const e = change({ id: 'old' })
    await ledger.handle([e])
    assert.ok(await store.get('seen:github:old'))
    clock.advance(121 * SECOND)
    assert.equal(await store.get('seen:github:old'), undefined)
  })

  test('order does not matter: any permutation of events gives the same outcome', async () => {
    // The property this whole design rests on. If it ever failed, an event would have to be
    // carrying state, and the "invalidation signal" principle would be false.
    const events = [
      change({ id: 'a', kind: 'repository.created' }),
      change({ id: 'b', kind: 'release.published' }),
      activity({ id: 'c' }),
      activity({ id: 'd' }),
      change({ id: 'e', kind: 'repository.renamed' }),
    ]
    const permutations = [
      [0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 0, 4, 1, 3], [3, 4, 0, 2, 1], [1, 2, 3, 4, 0],
    ]
    const summaries = []
    for (const order of permutations) {
      const { ledger, calls, clock } = harness()
      for (const index of order) {
        await ledger.handle([events[index]])
        clock.advance(SECOND)
      }
      clock.advance(DEFAULTS.cooldownMs + DEFAULTS.deferMs)
      await ledger.flush()
      const status = await ledger.status()
      summaries.push({
        published: calls.length > 0,
        totalEvents: calls.reduce((sum, call) => sum + call.events, 0),
        accepted: status.counters.accepted,
        pending: status.pending,
      })
    }
    for (const summary of summaries) assert.deepEqual(summary, summaries[0])
    assert.equal(summaries[0].totalEvents, 5, 'every event is accounted for, in whatever order')
    assert.equal(summaries[0].pending, null)
  })

  test('an event the last publish already covers does not cause another', async () => {
    const { ledger, calls, clock } = harness()
    await ledger.handle([change()])
    clock.advance(10 * MINUTE)
    // Happened five minutes before the dispatch: the build that ran afterwards read it.
    const early = change({ occurredAt: new Date(T0 - 5 * MINUTE).toISOString() })
    const [result] = await ledger.handle([early])
    assert.equal(result.outcome, 'covered')
    assert.equal(calls.length, 1)
  })

  test('but one inside the clock-skew margin is not assumed covered', async () => {
    const { ledger, calls, clock } = harness()
    await ledger.handle([change()])
    clock.advance(10 * MINUTE)
    const close = change({ occurredAt: new Date(T0 - 5 * SECOND).toISOString() })
    assert.equal((await ledger.handle([close]))[0].outcome, 'dispatched', 'a wrong clock may cost a build, never a change')
    assert.equal(calls.length, 2)
  })

  test('an event with no timestamp is never assumed covered', async () => {
    const { ledger, clock } = harness()
    await ledger.handle([change()])
    clock.advance(10 * MINUTE)
    assert.notEqual((await ledger.handle([change({ occurredAt: undefined })]))[0].outcome, 'covered')
  })

  test('a publish that FAILED covers nothing, because the old site is still what is live', async () => {
    const { ledger, clock } = harness()
    await ledger.handle([change()])
    await ledger.recordPublish({ id: 1, conclusion: 'failure', event: 'repository_dispatch', completedAt: new Date(T0 + 3 * MINUTE).toISOString() })
    clock.advance(10 * MINUTE)
    const early = change({ occurredAt: new Date(T0 - 5 * MINUTE).toISOString() })
    assert.notEqual((await ledger.handle([early]))[0].outcome, 'covered')
  })
})

/* Failure ----------------------------------------------------------------------- */

describe('publish failures', () => {
  test('a failed dispatch keeps the batch and retries later, not at once', async () => {
    const { ledger, calls, clock } = harness({ responses: [{ ok: false, status: 502, error: 'bad gateway' }, { ok: true }] })
    const [first] = await ledger.handle([change()])
    assert.equal(first.outcome, 'failed')
    let status = await ledger.status()
    assert.equal(status.pending.count, 1, 'the change is still waiting')
    assert.equal(status.pending.attempts, 1)
    assert.equal(status.lastFailure.status, 502)

    assert.deepEqual(await ledger.flush(), { skipped: 'backoff' }, 'a retry before its time is refused')
    assert.equal(calls.length, 1)

    clock.advance(DEFAULTS.cooldownMs + 20 * MINUTE)
    assert.deepEqual(await ledger.flush(), { dispatched: true })
    status = await ledger.status()
    assert.equal(status.pending, null)
    assert.equal(status.lastFailure, null, 'recovery clears the failure')
  })

  test('Retry-After is a floor: nothing retries before the provider said it could', async () => {
    const { ledger, clock } = harness({ responses: [{ ok: false, status: 429, retryAfterMs: 10 * MINUTE, error: 'rate limited' }, { ok: true }] })
    await ledger.handle([change()])
    clock.advance(9 * MINUTE)
    assert.deepEqual(await ledger.flush(), { skipped: 'backoff' })
    clock.advance(2 * MINUTE)
    assert.deepEqual(await ledger.flush(), { dispatched: true })
  })

  test('it gives up on its own after maxAttempts, visibly, and a new event revives it once', async () => {
    const { ledger, calls, clock } = harness({
      responses: [{ ok: false, status: 500, error: 'down' }],
      options: { maxAttempts: 3, cooldownMs: 0 },
    })
    await ledger.handle([change()])
    for (let i = 0; i < 6; i += 1) {
      clock.advance(30 * MINUTE)
      await ledger.flush()
    }
    const status = await ledger.status()
    assert.equal(calls.length, 3, 'exactly maxAttempts tries, not an infinite loop')
    assert.equal(status.pending.stalled, true, 'a stalled batch is shown, not silently dropped')

    clock.advance(30 * MINUTE)
    await ledger.handle([change()])
    assert.equal(calls.length, 4, 'fresh news earns exactly one more attempt')
    assert.equal((await ledger.status()).pending.stalled, true)
  })

  test('a publisher that throws loses nothing', async () => {
    const { ledger } = harness({ responses: [new Error('boom'), { ok: true }] })
    const [result] = await ledger.handle([change()])
    assert.equal(result.outcome, 'failed')
    assert.equal((await ledger.status()).pending.count, 1)
  })

  test('credentials never reach the status or the log', async () => {
    const leaked = 'token ghs_abcdefghijklmnopqrstu and Bearer abc.def.ghi and sha256=' + 'a'.repeat(64)
    const { ledger } = harness({ responses: [{ ok: false, status: 401, error: leaked }] })
    await ledger.handle([change()])
    const text = JSON.stringify(await ledger.status())
    assert.ok(!text.includes('ghs_abc'))
    assert.ok(!text.includes('abc.def.ghi'))
    assert.ok(!text.includes('a'.repeat(64)))
    assert.match(text, /\[redacted\]/)
    assert.equal(safeText('x'.repeat(500)).length, 200)
  })
})

/* Observing the result ---------------------------------------------------------- */

describe('knowing whether it reached the site', () => {
  const run = (over = {}) => ({
    id: 1, conclusion: 'success', event: 'repository_dispatch',
    url: 'https://github.com/ada/engine/actions/runs/1',
    completedAt: new Date(T0 + 175 * SECOND).toISOString(), ...over,
  })

  test('a successful run records the latency from the first change to it being live', async () => {
    const { ledger } = harness()
    await ledger.handle([change()])
    await ledger.recordPublish(run())
    const { lastPublish } = await ledger.status()
    assert.equal(lastPublish.conclusion, 'success')
    assert.equal(lastPublish.latencyMs, 175_000)
    assert.equal(lastPublish.runUrl, 'https://github.com/ada/engine/actions/runs/1')
  })

  test('runs the service did not start are not its to report', async () => {
    const { ledger } = harness()
    await ledger.handle([change()])
    for (const event of ['push', 'schedule', 'workflow_dispatch']) {
      assert.deepEqual(await ledger.recordPublish(run({ event })), { outcome: 'not-ours' })
    }
    assert.equal((await ledger.status()).lastPublish, null)
  })

  test('a failed run re-arms the batch so the change is retried; the old site stays up', async () => {
    const { ledger, calls, clock } = harness()
    await ledger.handle([change()])
    await ledger.recordPublish(run({ conclusion: 'failure' }))
    const status = await ledger.status()
    assert.equal(status.pending.urgency, 'now')
    assert.equal(status.counters.publishFailures, 1)

    clock.advance(DEFAULTS.cooldownMs + 20 * MINUTE)
    await ledger.flush()
    assert.equal(calls.length, 2, 'the failed publish was dispatched again')

    await ledger.recordPublish(run({ conclusion: 'success', id: 2 }))
    assert.equal((await ledger.status()).lastPublish.conclusion, 'success')
  })

  test('a cancelled run is not a failure: a newer run replaced it', async () => {
    const { ledger } = harness()
    await ledger.handle([change()])
    await ledger.recordPublish(run({ conclusion: 'cancelled' }))
    const status = await ledger.status()
    assert.equal(status.pending, null)
    assert.equal(status.counters.publishFailures, 0)
  })

  test('repeated failed runs stop retrying and say so', async () => {
    const { ledger, clock } = harness({ options: { maxAttempts: 2, cooldownMs: 0 } })
    await ledger.handle([change()])
    for (let i = 0; i < 2; i += 1) {
      await ledger.recordPublish(run({ conclusion: 'failure', id: i }))
      clock.advance(30 * MINUTE)
      await ledger.flush()
    }
    assert.equal((await ledger.status()).pending.stalled, true)
  })
})

/* Policy ------------------------------------------------------------------------ */

describe('publishing policy', () => {
  test('structural changes publish now and activity is deferred', () => {
    assert.equal(classify(change()), 'now')
    assert.equal(classify(activity()), 'defer')
  })

  test('only returns one of the three documented answers', () => {
    for (const kind of ['push', 'star.created', 'fork', 'release.published', 'repository.renamed', 'unheard-of']) {
      for (const weight of ['structural', 'activity']) {
        assert.ok(['now', 'defer', 'ignore'].includes(classify(change({ kind, weight }))), `${kind}/${weight}`)
      }
    }
  })
})

/* The publisher ----------------------------------------------------------------- */

describe('the repository dispatch publisher', () => {
  const stub = (response) => {
    const calls = []
    const fetch = async (url, options) => {
      calls.push({ url, ...options })
      if (response instanceof Error) throw response
      return new Response(null, response)
    }
    return { fetch, calls }
  }
  const request = { source: 'github', events: 3, ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], kinds: { push: 3 } }
  const make = (fetch, getToken = async () => 'ghs_installationtoken') =>
    createRepositoryDispatchPublisher({ repository: 'ada/engine', getToken, fetch })

  test('sends exactly what it should, to the right repository, and treats 204 as success', async () => {
    const { fetch, calls } = stub({ status: 204 })
    assert.deepEqual(await make(fetch)(request), { ok: true, status: 204 })
    assert.equal(calls[0].url, 'https://api.github.com/repos/ada/engine/dispatches')
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].headers.authorization, 'Bearer ghs_installationtoken')
    const body = JSON.parse(calls[0].body)
    assert.equal(body.event_type, EVENT_TYPE)
    assert.deepEqual(body.client_payload, { source: 'github', events: 3, kinds: { push: 3 }, sample: ['a', 'b', 'c', 'd', 'e'] })
  })

  test('carries no profile data — the build re-reads everything itself', async () => {
    const { fetch, calls } = stub({ status: 204 })
    await make(fetch)(request)
    assert.deepEqual(Object.keys(JSON.parse(calls[0].body).client_payload).sort(), ['events', 'kinds', 'sample', 'source'])
  })

  test('a refusal comes back as a value with its status and Retry-After', async () => {
    const { fetch } = stub({ status: 403, headers: { 'retry-after': '120' } })
    const result = await make(fetch)(request)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.retryAfterMs, 120_000)
  })

  test('network and token failures are values too, and never leak the token', async () => {
    const network = await make(stub(new TypeError('fetch failed')).fetch)(request)
    assert.deepEqual([network.ok, network.error], [false, 'network error: fetch failed'])

    const token = await make(stub({ status: 204 }).fetch, async () => { throw new Error('no installation: ghs_leakyleakyleakyleakyleaky12345') })(request)
    assert.equal(token.ok, false)
    assert.ok(!JSON.stringify(token).includes('ghs_leaky'))
  })

  test('refuses a malformed repository name at construction, not at the first event', () => {
    for (const bad of ['', 'no-slash', 'a/b/c', '../etc/passwd', 'a b/c']) {
      assert.throws(() => createRepositoryDispatchPublisher({ repository: bad, getToken: async () => 't' }), /owner\/name/)
    }
  })
})

/* The assembled service --------------------------------------------------------- */

describe('the sync service', () => {
  const SECRET = 'whsec-test-secret'
  const repository = {
    full_name: 'ada/engine', owner: { login: 'ada' }, default_branch: 'main', private: false,
    pushed_at: Math.floor(T0 / 1000), updated_at: new Date(T0).toISOString(),
  }

  async function deliver(service, { event, delivery, payload, secret = SECRET, rawBody, signature }) {
    const body = rawBody ?? JSON.stringify(payload)
    const headers = new Headers({
      'x-github-event': event,
      'x-github-delivery': delivery,
      'x-hub-signature-256': signature ?? (await signSha256(secret, body)),
    })
    return service.handleWebhook({ rawBody: body, headers })
  }

  function setup(over = {}) {
    let t = T0
    const store = createMemoryStore({ now: () => t })
    const published = []
    const service = createSyncService({
      store, account: 'ada', webhookSecret: SECRET, now: () => t, random: () => 0,
      publish: async (r) => { published.push(r); return { ok: true } },
      fetch: async () => { throw new Error('the network must not be touched by webhook handling') },
      ...over,
    })
    return { service, store, published, advance: (ms) => { t += ms } }
  }

  test('a signed repository event is accepted and publishes', async () => {
    const { service, published } = setup()
    const out = await deliver(service, { event: 'repository', delivery: 'g-1', payload: { action: 'created', repository } })
    assert.deepEqual([out.status, out.body], [202, { ok: true, outcome: 'dispatched' }])
    assert.equal(published.length, 1)
  })

  test('a forged request is refused before anything inside it is read', async () => {
    const { service, published } = setup()
    // Invalid JSON with a bad signature: if the body were parsed first this would be a 400.
    const bad = await deliver(service, { event: 'push', delivery: 'g-2', rawBody: '{not json', signature: 'sha256=' + '0'.repeat(64) })
    assert.deepEqual([bad.status, bad.body], [401, { error: 'invalid-signature' }])

    const wrongSecret = await deliver(service, { event: 'push', delivery: 'g-3', payload: {}, secret: 'attacker' })
    assert.equal(wrongSecret.status, 401)
    assert.equal(published.length, 0)
  })

  test('a missing signature header is a 401, never a pass', async () => {
    const { service } = setup()
    const out = await service.handleWebhook({ rawBody: '{}', headers: new Headers({ 'x-github-event': 'push' }) })
    assert.equal(out.status, 401)
  })

  test('a deployment that forgot its secret refuses everything and says why', async () => {
    const { service, published } = setup({ webhookSecret: undefined })
    const out = await deliver(service, { event: 'repository', delivery: 'g-4', payload: { action: 'created', repository } })
    assert.deepEqual([out.status, out.body], [503, { error: 'webhook-not-configured' }])
    assert.equal(published.length, 0)
  })

  test('a correctly signed body that is not JSON is a 400', async () => {
    const { service } = setup()
    const out = await deliver(service, { event: 'push', delivery: 'g-5', rawBody: '{not json' })
    assert.deepEqual([out.status, out.body], [400, { error: 'invalid-json' }])
  })

  test('an oversized body is refused before it is verified', async () => {
    const { service } = setup()
    const out = await service.handleWebhook({ rawBody: 'x'.repeat(MAX_BODY_BYTES + 1), headers: new Headers() })
    assert.equal(out.status, 413)
  })

  test('a replayed delivery — correct signature, same id — publishes once', async () => {
    // A valid signature does not stop replay; the delivery id does.
    const { service, published, advance } = setup()
    const args = { event: 'repository', delivery: 'g-replay', payload: { action: 'created', repository } }
    const first = await deliver(service, args)
    advance(10 * MINUTE)
    const replay = await deliver(service, args)
    assert.equal(first.body.outcome, 'dispatched')
    assert.equal(replay.body.outcome, 'duplicate')
    assert.equal(published.length, 1)
  })

  test('ping, uninteresting events and other accounts all answer 200, so GitHub reports no failure', async () => {
    const { service, published } = setup()
    assert.deepEqual((await deliver(service, { event: 'ping', delivery: 'p', payload: { zen: 'x' } })).body, { ok: true, pong: true })
    assert.deepEqual((await deliver(service, { event: 'issues', delivery: 'i', payload: { repository } })).body, { ok: true, ignored: 'unsubscribed-event' })
    const other = await deliver(service, { event: 'repository', delivery: 'o', payload: { action: 'created', repository: { ...repository, owner: { login: 'mallory' } } } })
    assert.deepEqual([other.status, other.body], [200, { ok: true, ignored: 'other-account' }])
    assert.equal(published.length, 0)
  })

  test('the deploy finishing is recorded, which is where observed latency comes from', async () => {
    const { service, advance } = setup()
    await deliver(service, { event: 'repository', delivery: 'g-6', payload: { action: 'created', repository } })
    advance(175 * SECOND)
    const done = await deliver(service, {
      event: 'workflow_run', delivery: 'w-1',
      payload: {
        action: 'completed', repository,
        workflow_run: {
          id: 7, path: '.github/workflows/deploy.yml', head_branch: 'main', event: 'repository_dispatch',
          conclusion: 'success', updated_at: new Date(T0 + 175 * SECOND).toISOString(),
        },
      },
    })
    assert.equal(done.status, 200)
    const status = await service.status()
    assert.equal(status.lastPublish.latencyMs, 175_000)
  })

  test('status reports which mechanisms have actually delivered, not which are configured', async () => {
    const { service } = setup()
    let status = await service.status()
    assert.equal(status.mechanisms.webhook.configured, true)
    assert.equal(status.mechanisms.webhook.lastSeenAt, null, 'configured is not the same as working')

    await deliver(service, { event: 'repository', delivery: 'g-7', payload: { action: 'created', repository } })
    status = await service.status()
    assert.equal(status.mechanisms.webhook.lastSeenAt, new Date(T0).toISOString())
    assert.equal(status.mechanisms.eventsPoll.lastSeenAt, null)
  })
})

describe('the scheduled tick', () => {
  const event = (id, type, payload = {}) => ({
    id: String(id), type, public: true, actor: { login: 'ada' },
    repo: { name: 'ada/engine' }, created_at: new Date(T0).toISOString(), payload,
  })

  function setup() {
    let t = T0
    const store = createMemoryStore({ now: () => t })
    const published = []
    let feed = []
    const calls = []
    const service = createSyncService({
      store, account: 'ada', webhookSecret: 's', now: () => t, random: () => 0,
      publish: async (r) => { published.push(r); return { ok: true } },
      fetch: async (url, options) => {
        calls.push({ url, headers: options.headers })
        return new Response(JSON.stringify(feed), { status: 200, headers: { etag: `W/"${feed.length}"`, 'x-poll-interval': '60' } })
      },
    })
    return {
      service, published, calls, store,
      advance: (ms) => { t += ms },
      setFeed: (events) => { feed = events },
    }
  }

  test('baseline, then a real change is detected and published with no webhook involved', async () => {
    const { service, published, advance, setFeed } = setup()

    setFeed([event(100, 'PushEvent')])
    assert.equal((await service.tick()).polled.outcome, 'baseline')
    assert.equal(published.length, 0, 'what was already there is not news')

    advance(61 * SECOND)
    setFeed([event(101, 'CreateEvent', { ref_type: 'repository' }), event(100, 'PushEvent')])
    const tick = await service.tick()
    assert.deepEqual(tick.polled, { outcome: 'changes', changes: 1 })
    assert.equal(published.length, 1)
    assert.equal(published[0].kinds['repository.created'], 1)

    const status = await service.status()
    assert.equal(status.mechanisms.eventsPoll.lastSeenAt !== null, true)
    assert.equal(status.lastVia, 'events-poll')
  })

  test('does not poll again before it is due', async () => {
    const { service, calls, advance, setFeed } = setup()
    setFeed([event(1, 'PushEvent')])
    await service.tick()
    advance(10 * SECOND)
    assert.equal((await service.tick()).polled.outcome, 'not-due')
    assert.equal(calls.length, 1)
  })

  test('the tick publishes what was waiting even when polling is disabled', async () => {
    let t = T0
    const published = []
    const service = createSyncService({
      store: createMemoryStore({ now: () => t }), account: 'ada', webhookSecret: 's', pollEnabled: false,
      now: () => t, random: () => 0, publish: async (r) => { published.push(r); return { ok: true } },
    })
    const body = JSON.stringify({ action: 'created', repository: { full_name: 'ada/e', owner: { login: 'ada' }, default_branch: 'main', private: false } })
    // A push is deferred; only a later flush may publish it.
    const pushBody = JSON.stringify({ ref: 'refs/heads/main', repository: { full_name: 'ada/e', owner: { login: 'ada' }, default_branch: 'main', private: false } })
    await service.handleWebhook({
      rawBody: pushBody,
      headers: new Headers({ 'x-github-event': 'push', 'x-github-delivery': 'p1', 'x-hub-signature-256': await signSha256('s', pushBody) }),
    })
    assert.equal(published.length, 0)
    t += DEFAULTS.deferMs + SECOND
    const out = await service.tick()
    assert.deepEqual(out.polled, { outcome: 'disabled' })
    assert.equal(published.length, 1)
    void body
  })

  test('a failing poll does not stop the next flush', async () => {
    let t = T0
    const published = []
    const service = createSyncService({
      store: createMemoryStore({ now: () => t }), account: 'ada', webhookSecret: 's',
      now: () => t, random: () => 0,
      publish: async (r) => { published.push(r); return { ok: true } },
      fetch: async () => { throw new TypeError('offline') },
    })
    const out = await service.tick()
    assert.equal(out.polled.outcome, 'error')
    assert.deepEqual(out.flushed, { skipped: 'nothing-pending' })
  })
})
