import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { applyLastKnownGood } from '../src/core/sync/lastKnownGood.js'
import { runConnectors } from '../src/connectors/run.js'
import { deriveHealth } from '../src/core/sources/health.js'
import { getConnector } from '../src/connectors/index.js'

/**
 * A source that fails keeps what it last delivered.
 *
 * The bug this exists for was quiet: nothing crashed, no test failed, and the portfolio simply
 * lost a source's data for a week because one provider returned a 503 during a scheduled
 * deploy. The importer's cleanup deletes the file of every source that "produced nothing" on a
 * full run — right for a source the owner removed, wrong for one that merely timed out.
 */

const profile = (name) => ({ projects: [{ id: name, name }], skills: [{ name: 'TypeScript' }] })

const failing = (extra = {}) => ({
  connector: 'github', name: 'GitHub', state: 'error', message: 'GitHub is having trouble right now (HTTP 503).',
  lastSuccessfulAt: '2026-10-12T06:00:00.000Z', ...extra,
})

describe('last-known-good', () => {
  test('a failed source keeps its previous profile', () => {
    const previous = profile('engine')
    const out = applyLastKnownGood({
      sources: [],
      status: { github: failing() },
      previousProfiles: { github: previous },
    })
    assert.deepEqual(out.sources, [{ key: 'github', connector: 'github', profile: previous }])
    assert.deepEqual(out.restored, ['github'])
  })

  test('the failure stays visible, and says the data is old', () => {
    const out = applyLastKnownGood({
      sources: [], status: { github: failing() }, previousProfiles: { github: profile('x') },
    })
    assert.equal(out.status.github.state, 'error', 'preserving data must not hide the fault from the owner')
    assert.equal(out.status.github.servingLastKnownGood, true)
    assert.match(out.status.github.message, /HTTP 503/)
    assert.match(out.status.github.message, /last successful import \(2026-10-12\)/)
  })

  test('a missing credential is a failure to reach the source, so it is preserved too', () => {
    const out = applyLastKnownGood({
      sources: [], status: { github: failing({ state: 'unavailable', message: 'needs a token' }) },
      previousProfiles: { github: profile('x') },
    })
    assert.deepEqual(out.restored, ['github'])
  })

  test('a source that succeeded is left exactly as it was', () => {
    const fresh = { key: 'github', connector: 'github', profile: profile('new') }
    const status = { github: { connector: 'github', name: 'GitHub', state: 'imported', message: 'ok' } }
    const out = applyLastKnownGood({ sources: [fresh], status, previousProfiles: { github: profile('old') } })
    assert.deepEqual(out.sources, [fresh])
    assert.deepEqual(out.status, status)
    assert.deepEqual(out.restored, [])
  })

  test('an EMPTY answer is the truth, not a failure — a deleted repository must not come back', () => {
    const status = { github: { connector: 'github', name: 'GitHub', state: 'empty', message: 'nothing to show' } }
    const out = applyLastKnownGood({ sources: [], status, previousProfiles: { github: profile('deleted') } })
    assert.deepEqual(out.sources, [])
    assert.deepEqual(out.restored, [])
  })

  test('a skipped source (invalid configuration) has nothing to be loyal to', () => {
    const status = { github: { connector: 'github', name: 'GitHub', state: 'skipped', message: 'no username' } }
    const out = applyLastKnownGood({ sources: [], status, previousProfiles: { github: profile('x') } })
    assert.deepEqual(out.sources, [])
  })

  test('with no previous profile there is nothing to keep, and nothing is invented', () => {
    const out = applyLastKnownGood({ sources: [], status: { github: failing() }, previousProfiles: {} })
    assert.deepEqual(out.sources, [])
    assert.equal(out.status.github.servingLastKnownGood, undefined)
    assert.equal(out.status.github.message, failing().message)
  })

  test('a source the owner removed is never resurrected', () => {
    // `previousProfiles` still has it on disk; `status` does not, because it is not configured.
    const out = applyLastKnownGood({
      sources: [], status: { npm: failing({ connector: 'npm' }) },
      previousProfiles: { npm: profile('a'), 'removed-source': profile('ghost') },
    })
    assert.deepEqual(out.sources.map((s) => s.key), ['npm'])
  })

  test('the previous full profile replaces a thin one salvaged from the owner\'s own config', () => {
    const salvaged = { key: 'github', connector: 'github', profile: { socials: [{ platform: 'github' }] } }
    const previous = profile('engine')
    const out = applyLastKnownGood({
      sources: [salvaged], status: { github: failing() }, previousProfiles: { github: previous },
    })
    assert.equal(out.sources.length, 1)
    assert.deepEqual(out.sources[0].profile, previous)
  })

  test('other sources are unaffected and output order is deterministic', () => {
    const npm = { key: 'npm', connector: 'npm', profile: profile('pkg') }
    const out = applyLastKnownGood({
      sources: [npm],
      status: { npm: { connector: 'npm', name: 'npm', state: 'imported', message: 'ok' }, github: failing() },
      previousProfiles: { github: profile('engine') },
    })
    assert.deepEqual(out.sources.map((s) => s.key), ['github', 'npm'], 'sorted, so a re-run writes identical files')
    assert.deepEqual(out.sources[1], npm)
  })

  test('does not mutate its inputs', () => {
    const sources = [{ key: 'a', connector: 'npm', profile: profile('a') }]
    const status = { github: failing() }
    const previousProfiles = { github: profile('x') }
    const snapshot = JSON.stringify({ sources, status, previousProfiles })
    applyLastKnownGood({ sources, status, previousProfiles })
    assert.equal(JSON.stringify({ sources, status, previousProfiles }), snapshot)
  })

  test('health reports the flag, so the admin can say "failing but still showing your data"', () => {
    const status = applyLastKnownGood({
      sources: [], status: { github: failing() }, previousProfiles: { github: profile('x') },
    }).status.github
    const health = deriveHealth({ key: 'github', connector: getConnector('github'), status })
    assert.equal(health.servingLastKnownGood, true)
    assert.equal(health.state, 'error', 'still needs attention')
  })
})

describe('last-known-good, end to end through the real runner', () => {
  const NOW = Date.parse('2026-10-19T00:00:00Z')
  const ok = (body) => ({ ok: true, status: 200, headers: new Headers({}), json: async () => body, text: async () => JSON.stringify(body) })
  const down = () => ({ ok: false, status: 503, headers: new Headers({}), json: async () => ({}), text: async () => '' })

  test('a provider outage on the second run does not remove the first run\'s data', async () => {
    const dataSources = { npm: { username: 'ada' } }

    // Run 1: the provider answers. Whatever the connector makes of it becomes the "disk" state.
    const first = await runConnectors({
      dataSources, now: NOW,
      fetch: async () => ok({ objects: [{ package: { name: 'engine', description: 'x', version: '1.0.0', links: {} } }], total: 1 }),
    })
    assert.equal(first.sources.length, 1, 'the first run must produce something for this test to mean anything')
    const onDisk = Object.fromEntries(first.sources.map((s) => [s.key, s.profile]))

    // Run 2: the provider is down.
    const second = await runConnectors({
      dataSources, now: NOW + 86_400_000, previous: first.status, previousProfiles: onDisk, fetch: async () => down(),
    })
    assert.equal(second.sources.length, 0, 'without last-known-good this is where the data would vanish')
    assert.equal(second.status.npm.state, 'error')

    const kept = applyLastKnownGood({ sources: second.sources, status: second.status, previousProfiles: onDisk })
    assert.equal(kept.sources.length, 1)
    assert.deepEqual(kept.sources[0].profile, onDisk.npm)
    assert.equal(kept.status.npm.servingLastKnownGood, true)
    assert.equal(kept.status.npm.lastSuccessfulAt, first.status.npm.lastSuccessfulAt, 'the memory of success survives, as before')
  })
})
