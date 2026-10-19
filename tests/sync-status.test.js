import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createSyncService } from '../src/core/sync/service.js'
import { createMemoryStore } from '../src/core/sync/store.js'
import { signSha256 } from '../src/core/sync/signature.js'
import { describeSync } from '../src/core/sync/capability.js'
import { getConnector } from '../src/connectors/index.js'
import { normalizeSyncStatus, observedFrom, statusUrlOf, syncDeploymentOf } from '../src/core/sync/status.js'
import { resolveConfig } from '../src/core/config/resolve.js'

/**
 * The admin's reading of the sync service's status.
 *
 * Two things are tested and they pull in opposite directions. The normalizer must accept
 * *exactly* what the real service sends — so the first block feeds it the real service's own
 * output, not a hand-built fixture that could drift from it. And it must give a hostile or merely
 * different server nothing to work with — so the second block throws everything at it.
 */

const T0 = Date.parse('2026-10-19T12:00:00.000Z')

describe('reading the real service\'s status', () => {
  async function realStatus() {
    let t = T0
    const service = createSyncService({
      store: createMemoryStore({ now: () => t }), account: 'ada', webhookSecret: 's', now: () => t, random: () => 0,
      publish: async () => ({ ok: true }),
    })
    const body = JSON.stringify({
      action: 'created',
      repository: { full_name: 'ada/e', owner: { login: 'ada' }, default_branch: 'main', private: false, updated_at: new Date(T0).toISOString() },
    })
    await service.handleWebhook({
      rawBody: body,
      headers: new Headers({ 'x-github-event': 'repository', 'x-github-delivery': 'd1', 'x-hub-signature-256': await signSha256('s', body) }),
    })
    t += 175_000
    const done = JSON.stringify({
      action: 'completed',
      repository: { default_branch: 'main' },
      workflow_run: { id: 1, path: '.github/workflows/deploy.yml', head_branch: 'main', event: 'repository_dispatch', conclusion: 'success', updated_at: new Date(t).toISOString(), html_url: 'https://github.com/ada/e/actions/runs/1' },
    })
    await service.handleWebhook({
      rawBody: done,
      headers: new Headers({ 'x-github-event': 'workflow_run', 'x-github-delivery': 'w1', 'x-hub-signature-256': await signSha256('s', done) }),
    })
    // Through JSON, as it would arrive over the network.
    return JSON.parse(JSON.stringify(await service.status()))
  }

  test('keeps every field the admin shows', async () => {
    const status = normalizeSyncStatus(await realStatus())
    assert.ok(status)
    assert.equal(status.lastVia, 'webhook')
    assert.equal(status.lastEventAt, new Date(T0).toISOString())
    assert.equal(status.lastDispatch.events, 1)
    assert.equal(status.lastPublish.conclusion, 'success')
    assert.equal(status.lastPublish.latencyMs, 175_000)
    assert.equal(status.lastPublish.runUrl, 'https://github.com/ada/e/actions/runs/1')
    assert.equal(status.counters.dispatched, 1)
    assert.equal(status.mechanisms.webhook.configured, true)
    assert.equal(status.mechanisms.webhook.lastSeenAt, new Date(T0).toISOString())
    assert.ok(status.log.length >= 2)
  })

  test('loses nothing the service sent that it knows about', async () => {
    const raw = await realStatus()
    const status = normalizeSyncStatus(raw)
    // Fields the service sends that the normalized shape represents differently, on purpose:
    // `source` is always "github" here and `lastSeen` is the same data as
    // `mechanisms.*.lastSeenAt`, which is kept. Anything *else* missing is a real drop.
    const represented = { source: null, lastSeen: 'mechanisms' }
    for (const key of Object.keys(raw)) {
      assert.ok(key in status || key in represented, `the normalizer silently dropped "${key}"`)
    }
    assert.equal(status.mechanisms.webhook.lastSeenAt, raw.lastSeen.webhook, 'lastSeen is carried under mechanisms')
  })

  test('feeds describeSync, which promotes a webhook only because one was actually seen', async () => {
    const status = normalizeSyncStatus(await realStatus())
    const d = describeSync(getConnector('github'), {
      deployment: { endpoint: 'https://sync.example' }, observed: observedFrom(status), now: T0 + 200_000,
    })
    assert.equal(d.effective, 'webhook')
    assert.equal(d.observedLatencyMs, 175_000)
  })
})

describe('a hostile or different server', () => {
  const base = () => ({ counters: { accepted: 1 }, mechanisms: { webhook: { configured: true }, eventsPoll: { enabled: true } } })

  test('anything that is not a status is rejected outright', () => {
    for (const bad of [null, undefined, 5, 'ok', [], true, {}, { hello: 'world' }, { counters: 'x' }]) {
      assert.equal(normalizeSyncStatus(bad), null, JSON.stringify(bad))
    }
  })

  test('strings are bounded, so a megabyte of text cannot reach the screen', () => {
    const status = normalizeSyncStatus({
      ...base(),
      lastFailure: { error: 'x'.repeat(1_000_000), at: '2026-10-19T12:00:00Z' },
      log: [{ detail: 'y'.repeat(1_000_000), kind: 'k'.repeat(1000) }],
    })
    assert.equal(status.lastFailure.error.length, 200)
    assert.equal(status.log[0].detail.length, 120)
    assert.equal(status.log[0].kind.length, 30)
  })

  test('the log is capped', () => {
    const status = normalizeSyncStatus({ ...base(), log: Array.from({ length: 5000 }, (_, i) => ({ kind: 'k', detail: String(i) })) })
    assert.equal(status.log.length, 10)
    assert.equal(status.log.at(-1).detail, '4999', 'the most recent entries are kept')
  })

  test('numbers must be numbers; counters must be sane', () => {
    const status = normalizeSyncStatus({
      counters: { accepted: '5', dispatched: -3, failures: NaN, covered: 2.9, ignored: Infinity, 'bad key!': 1, __proto__x: 4 },
      mechanisms: { eventsPoll: { consecutiveFailures: 'many' } },
      pending: { count: { evil: 1 }, attempts: -1 },
    })
    assert.deepEqual(status.counters, { accepted: 0, dispatched: 0, failures: 0, covered: 2, ignored: 0 })
    assert.equal(status.mechanisms.eventsPoll.consecutiveFailures, 0)
    assert.equal(status.pending.count, 0)
    assert.equal(status.pending.attempts, 0)
  })

  test('timestamps must parse; anything else becomes null', () => {
    const status = normalizeSyncStatus({
      ...base(), lastEventAt: 'yesterday', generatedAt: 12345, lastDispatch: { at: '<script>', events: 1 },
      mechanisms: { webhook: { lastSeenAt: 'never' }, eventsPoll: { lastPolledAt: {} } },
    })
    assert.equal(status.lastEventAt, null)
    assert.equal(status.generatedAt, null)
    assert.equal(status.lastDispatch.at, null)
    assert.equal(status.mechanisms.webhook.lastSeenAt, null)
    assert.equal(status.mechanisms.eventsPoll.lastPolledAt, null)
  })

  test('unrecognised fields are dropped, not passed through', () => {
    const status = normalizeSyncStatus({ ...base(), secret: 'x', html: '<img src=x onerror=alert(1)>', extra: { a: 1 } })
    assert.deepEqual(Object.keys(status).sort(), [
      'counters', 'generatedAt', 'lastDispatch', 'lastEventAt', 'lastFailure', 'lastPublish', 'lastVia', 'log', 'mechanisms', 'pending',
    ])
  })

  test('a run link is kept only if it is a GitHub Actions run', () => {
    const link = (runUrl) => normalizeSyncStatus({ ...base(), lastPublish: { conclusion: 'success', runUrl } }).lastPublish.runUrl
    assert.equal(link('https://github.com/ada/e/actions/runs/123'), 'https://github.com/ada/e/actions/runs/123')
    for (const bad of [
      'https://evil.example/actions/runs/1', 'javascript:alert(1)', 'http://github.com/a/b/actions/runs/1',
      'https://github.com/a/b', 'https://github.com.evil.example/a/b/actions/runs/1', 'nope', 5, null,
    ]) {
      assert.equal(link(bad), null, String(bad))
    }
  })

  test('a status with wrong-typed nested blocks still normalizes, to nothing', () => {
    const status = normalizeSyncStatus({
      counters: { accepted: 1 }, pending: 'yes', lastDispatch: [], lastFailure: 7, lastPublish: 'ok',
      mechanisms: 'webhook', log: 'a log',
    })
    assert.equal(status.pending, null)
    assert.equal(status.lastDispatch, null)
    assert.equal(status.lastFailure, null)
    assert.equal(status.lastPublish, null)
    assert.equal(status.mechanisms.webhook.configured, false)
    assert.deepEqual(status.log, [])
  })

  test('a lie cannot promote a mechanism: absent observations stay absent', () => {
    const status = normalizeSyncStatus({ counters: {}, mechanisms: { webhook: { configured: true, lastSeenAt: null } } })
    const d = describeSync(getConnector('github'), { deployment: { endpoint: 'https://s.example' }, observed: observedFrom(status), now: T0 })
    assert.equal(d.effective, 'schedule')
  })

  test('nothing observed at all is "unknown", not "working"', () => {
    assert.equal(observedFrom(null), undefined)
    assert.equal(observedFrom(undefined), undefined)
  })
})

describe('where the status is read from', () => {
  test('is the configured endpoint, normalised by the engine', () => {
    const { config } = resolveConfig({ sync: { endpoint: 'https://portfolio-sync.ada.workers.dev/' } })
    assert.deepEqual(syncDeploymentOf(config), { endpoint: 'https://portfolio-sync.ada.workers.dev' })
    assert.equal(statusUrlOf('https://portfolio-sync.ada.workers.dev'), 'https://portfolio-sync.ada.workers.dev/sync/status')
    assert.equal(statusUrlOf('https://x.example/api/'), 'https://x.example/api/sync/status')
  })

  test('is nothing when none is configured', () => {
    assert.deepEqual(syncDeploymentOf(resolveConfig({}).config), {})
    assert.deepEqual(syncDeploymentOf(undefined), {})
    assert.deepEqual(syncDeploymentOf({ sync: { endpoint: 5 } }), {})
  })
})
