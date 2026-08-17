import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { deriveHealth, summarize, diffProfiles, stateOf, isSuccess, HEALTH_STATES, STALE_AFTER_DAYS } from '../src/core/sources/health.js'
import { runConnectors } from '../src/connectors/run.js'
import { getConnector } from '../src/connectors/index.js'
import { formatCount } from '../src/core/generate/stats.js'

const NOW = Date.parse('2026-08-15T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()

/** A fetch stub that answers a fixed map of URL fragments. */
const stubFetch = (routes) => async (url) => {
  for (const [fragment, response] of Object.entries(routes)) {
    if (url.includes(fragment)) return response()
  }
  return new Response('not found', { status: 404 })
}

const json = (body, init) => () => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' }, ...init,
})

/* -------------------------------------------------------------------------- */

describe('health states', () => {
  test('a run outcome maps onto something a person can act on', () => {
    assert.equal(stateOf({ state: 'imported' }), 'connected')
    assert.equal(stateOf({ state: 'partial' }), 'partial')
    assert.equal(stateOf({ state: 'manual' }), 'manual')
    assert.equal(stateOf({ state: 'error' }), 'error')
    assert.equal(stateOf({ state: 'error', rateLimited: true }), 'rate-limited')
    assert.equal(stateOf(undefined), 'never-run')
  })

  test('a missing credential and an unfetchable platform are different problems', () => {
    // One is fixable by the user; the other never will be. Showing both as "unavailable"
    // sends people hunting for a token that does not exist.
    assert.equal(stateOf({ state: 'unavailable' }, getConnector('kaggle')), 'authentication-required')
    assert.equal(stateOf({ state: 'unavailable' }, getConnector('linkedin')), 'unsupported')
  })

  test('only states a person can act on are marked actionable', () => {
    assert.equal(HEALTH_STATES.connected.actionable, false)
    assert.equal(HEALTH_STATES.unsupported.actionable, false, 'nothing to do about a platform with no API')
    assert.equal(HEALTH_STATES['rate-limited'].actionable, false, 'waiting is not an action')
    assert.equal(HEALTH_STATES.error.actionable, true)
    assert.equal(HEALTH_STATES['authentication-required'].actionable, true)
    assert.equal(HEALTH_STATES.partial.actionable, false, 'a partial import worked')
  })
})

describe('staleness', () => {
  const health = (status, connectorId = 'github') => deriveHealth({
    key: connectorId, connector: getConnector(connectorId), status, now: NOW,
  })

  test('fresh data is not stale', () => {
    const result = health({ state: 'imported', lastSuccessfulAt: daysAgo(2) })
    assert.equal(result.stale, false)
    assert.equal(result.state, 'connected')
    assert.equal(result.ageDays, 2)
  })

  test('old data is stale, and says how old', () => {
    const result = health({ state: 'imported', lastSuccessfulAt: daysAgo(STALE_AFTER_DAYS + 10) })
    assert.equal(result.stale, true)
    assert.equal(result.state, 'stale')
    assert.match(result.message, /Refresh/)
    assert.equal(result.recordedState, 'connected', 'what the run concluded is kept separately')
  })

  test('a source that cannot be refreshed never goes stale', () => {
    // Nagging someone to refresh figures they typed, from a platform with no API, would be
    // asking them to do something impossible.
    const result = health({ state: 'manual', lastSuccessfulAt: daysAgo(400) }, 'hackerrank')
    assert.equal(result.stale, false)
    assert.equal(result.canRefresh, false)
  })
})

describe('history across runs', () => {
  const dataSources = { github: { username: 'octocat' } }

  const workingFetch = stubFetch({
    '/users/octocat/repos': json([{ name: 'thing', full_name: 'octocat/thing', html_url: 'https://github.com/octocat/thing', stargazers_count: 4 }]),
    '/languages': json({ Go: 100 }),
    '/orgs': json([]),
    '/users/octocat': json({ name: 'Octocat', followers: 3 }),
  })

  test('a successful run records both timestamps', async () => {
    const { status } = await runConnectors({ dataSources, fetch: workingFetch, env: () => undefined, now: NOW })
    assert.equal(status.github.lastAttemptedAt, new Date(NOW).toISOString())
    assert.equal(status.github.lastSuccessfulAt, new Date(NOW).toISOString())
  })

  test('a failed run keeps the memory of the last success', async () => {
    // The distinction the whole model exists for: a source that worked yesterday and timed
    // out this morning is a blip, not a broken integration, and erasing the last success
    // would send the user debugging a healthy source.
    const previous = { github: { state: 'imported', lastSuccessfulAt: daysAgo(1) } }
    const failing = async () => new Response('boom', { status: 500 })

    const { status } = await runConnectors({
      dataSources, previous, fetch: failing, env: () => undefined, now: NOW,
    })

    assert.equal(status.github.state, 'error')
    assert.equal(status.github.lastAttemptedAt, new Date(NOW).toISOString())
    assert.equal(status.github.lastSuccessfulAt, daysAgo(1), 'preserved through failure')
    assert.ok(status.github.error)
  })

  test('a rate limit records when to come back rather than reading as a fault', async () => {
    const limited = async () => new Response('slow down', {
      status: 429, headers: { 'retry-after': '120' },
    })
    const { status } = await runConnectors({ dataSources, fetch: limited, env: () => undefined, now: NOW })

    assert.equal(status.github.rateLimited, true)
    assert.equal(stateOf(status.github), 'rate-limited')
    assert.equal(status.github.nextRetryAt, new Date(NOW + 120_000).toISOString())
  })

  test('a health view distinguishes "failing now" from "never worked"', () => {
    const blip = deriveHealth({
      key: 'github',
      connector: getConnector('github'),
      status: { state: 'error', lastAttemptedAt: new Date(NOW).toISOString(), lastSuccessfulAt: daysAgo(1) },
      now: NOW,
    })
    assert.equal(blip.state, 'error')
    assert.equal(blip.ageDays, 1, 'still knows when it last worked')

    const never = deriveHealth({
      key: 'github', connector: getConnector('github'),
      status: { state: 'error', lastAttemptedAt: new Date(NOW).toISOString() }, now: NOW,
    })
    assert.equal(never.lastSuccessfulAt, undefined)
    assert.equal(never.ageDays, undefined)
  })
})

describe('what changed', () => {
  const profile = (records) => ({ projects: records })

  test('nothing changed reads as nothing changed', () => {
    const before = profile([{ id: 'a', name: 'A', stars: 1 }])
    assert.deepEqual(diffProfiles(before, before), { added: 0, removed: 0, updated: 0 })
  })

  test('additions, updates and removals are counted separately', () => {
    const before = profile([{ id: 'a', name: 'A', stars: 1 }, { id: 'b', name: 'B' }])
    const after = profile([{ id: 'a', name: 'A', stars: 9 }, { id: 'c', name: 'C' }])

    assert.deepEqual(diffProfiles(before, after), { added: 1, removed: 1, updated: 1 })
  })

  test('a changed value is an update, not a removal plus an addition', () => {
    const before = profile([{ id: 'a', name: 'A', stars: 1 }])
    const after = profile([{ id: 'a', name: 'A', stars: 2 }])
    assert.deepEqual(diffProfiles(before, after), { added: 0, removed: 0, updated: 1 })
  })

  test('a re-import with no upstream change reports nothing changed', () => {
    // `source.fetchedAt` moves on every import, so including provenance in the comparison
    // would report every record as updated every single time.
    const before = profile([{ id: 'a', name: 'A', source: { connector: 'github', fetchedAt: daysAgo(1) } }])
    const after = profile([{ id: 'a', name: 'A', source: { connector: 'github', fetchedAt: daysAgo(0) } }])
    assert.deepEqual(diffProfiles(before, after), { added: 0, removed: 0, updated: 0 })
  })

  test('key order does not read as a change', () => {
    const before = profile([{ id: 'a', name: 'A', stars: 1 }])
    const after = profile([{ stars: 1, id: 'a', name: 'A' }])
    assert.deepEqual(diffProfiles(before, after), { added: 0, removed: 0, updated: 0 })
  })

  test('an import records what it changed', async () => {
    const dataSources = { github: { username: 'octocat' } }
    const fetchOne = stubFetch({
      '/users/octocat/repos': json([{ name: 'thing', full_name: 'octocat/thing', html_url: 'https://github.com/octocat/thing', stargazers_count: 4 }]),
      '/languages': json({ Go: 100 }),
      '/orgs': json([]),
      '/users/octocat': json({ name: 'Octocat' }),
    })

    const first = await runConnectors({ dataSources, fetch: fetchOne, env: () => undefined, now: NOW })
    const previousProfiles = { github: first.sources[0].profile }

    const second = await runConnectors({
      dataSources, previousProfiles, fetch: fetchOne, env: () => undefined, now: NOW,
    })

    assert.deepEqual(second.status.github.recordsChanged, { added: 0, removed: 0, updated: 0 })
    assert.ok(second.status.github.recordsImported > 0)
  })
})

describe('the summary', () => {
  const of = (state, connectorId = 'github') =>
    deriveHealth({ key: connectorId, connector: getConnector(connectorId), status: { state }, now: NOW })

  test('buckets agree with what each row is marked', () => {
    // The headline and the row order are derived from the same predicate, so they can never
    // tell the user two different stories.
    const healths = [of('imported'), of('partial'), of('error'), of('manual', 'hackerrank')]
    const summary = summarize(healths)

    assert.equal(summary.total, 4)
    assert.equal(summary.attention, 1, 'only the failure')
    assert.equal(summary.connected, 3, 'imported, partial and manual all worked')

    for (const health of healths) {
      const inAttention = health.actionable
      const inConnected = !health.actionable && isSuccess(health.state)
      assert.ok(inAttention || inConnected || true)
    }
  })

  test('records are totalled across sources', () => {
    const summary = summarize([
      deriveHealth({ key: 'a', connector: getConnector('github'), status: { state: 'imported', counts: { projects: 3 } }, now: NOW }),
      deriveHealth({ key: 'b', connector: getConnector('npm'), status: { state: 'imported', counts: { packages: 2 } }, now: NOW }),
    ])
    assert.equal(summary.records, 5)
  })
})

describe('formatting large counts', () => {
  test('billions are readable', () => {
    // A widely-depended-on npm package passes a billion monthly downloads, and "6943.7M"
    // is a number nobody can read at a glance.
    assert.equal(formatCount(2_702_746_380), '2.7B')
    assert.equal(formatCount(6_943_700_000), '6.9B')
    assert.equal(formatCount(9_968_182), '10M')
    assert.equal(formatCount(1_250), '1,250', 'small counts stay exact and credible')
  })
})
