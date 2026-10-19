import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CONNECTORS, getConnector } from '../src/connectors/index.js'
import { OBSERVED_WITHIN_MS, describeSync } from '../src/core/sync/capability.js'
import { GITHUB_WEBHOOK_EVENTS } from '../src/core/sync/github.js'
import { MIN_POLL_MS } from '../src/core/sync/poller.js'
import { refreshPolicyFor, SCHEDULE } from '../src/core/sources/refresh.js'

/**
 * Honest descriptions of how a source updates.
 *
 * The failure to prevent is a label that flatters: "updates in real time" over a webhook nobody
 * has ever seen deliver. So the rule under test is that nothing is promoted on configuration
 * alone — only on evidence the service has recorded — and that what a connector *declares* about
 * itself matches what the code beneath it actually does.
 */

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const ago = (ms) => new Date(NOW - ms).toISOString()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const github = getConnector('github')
const deployed = { endpoint: 'https://sync.example.workers.dev' }
const describe_ = (connector, context = {}) => describeSync(connector, { now: NOW, ...context })

describe('what a source can honestly claim', () => {
  test('with no sync service, everything is on the schedule, and says so', () => {
    const d = describe_(github)
    assert.equal(d.effective, 'schedule')
    assert.match(d.summary, new RegExp(SCHEDULE.description))
    assert.match(d.latency, /week|push/)
    assert.ok(d.mechanisms.every((m) => m.status === 'not-deployed'))
  })

  test('a connector with nothing to read is manual, whatever is deployed', () => {
    const manual = CONNECTORS.find((c) => typeof c.fetch !== 'function')
    assert.ok(manual, 'the catalogue should contain at least one manual or link-only connector')
    const d = describe_(manual, { deployment: deployed })
    assert.equal(d.effective, 'manual')
    assert.deepEqual(d.mechanisms, [])
  })

  test('a deployed service nobody has heard from is NOT yet a better mechanism', () => {
    const d = describe_(github, { deployment: deployed })
    assert.equal(d.effective, 'schedule', 'configured is not the same as working')
    assert.ok(d.mechanisms.every((m) => m.status === 'unverified'))
    assert.match(d.summary, /not been seen working/)
  })

  test('a webhook that has delivered is promoted, with the provider\'s own latency', () => {
    const d = describe_(github, { deployment: deployed, observed: { webhook: { lastSeenAt: ago(2 * HOUR) } } })
    assert.equal(d.effective, 'webhook')
    assert.equal(d.mechanisms.find((m) => m.kind === 'webhook').status, 'observed')
    assert.match(d.latency, /seconds/)
  })

  test('a quiet account may go weeks without a webhook; months is not working', () => {
    const within = OBSERVED_WITHIN_MS.webhook
    const fine = describe_(github, { deployment: deployed, observed: { webhook: { lastSeenAt: ago(within - DAY) } } })
    const stale = describe_(github, { deployment: deployed, observed: { webhook: { lastSeenAt: ago(within + DAY) } } })
    assert.equal(fine.effective, 'webhook')
    assert.equal(stale.effective, 'schedule')
  })

  test('polling is promoted only while it is actually running', () => {
    const running = describe_(github, { deployment: deployed, observed: { eventsPoll: { lastPolledAt: ago(5 * 60_000) } } })
    assert.equal(running.effective, 'events-poll')
    const dead = describe_(github, { deployment: deployed, observed: { eventsPoll: { lastPolledAt: ago(2 * HOUR) } } })
    assert.equal(dead.effective, 'schedule', 'a poll that stopped an hour ago is not "automatic"')
  })

  test('a webhook outranks polling: it is the one that sees other people\'s stars', () => {
    const d = describe_(github, {
      deployment: deployed,
      observed: { webhook: { lastSeenAt: ago(HOUR) }, eventsPoll: { lastPolledAt: ago(60_000) } },
    })
    assert.equal(d.effective, 'webhook')
    assert.equal(d.mechanisms.length, 2)
  })

  test('polling states what it cannot see', () => {
    const poll = describe_(github).mechanisms.find((m) => m.kind === 'events-poll')
    assert.ok(poll.blindTo.some((text) => /stars/.test(text)), 'the gap must be stated, not discovered')
  })

  test('observed latency is reported only from a publish that succeeded', () => {
    const base = { deployment: deployed, observed: { webhook: { lastSeenAt: ago(HOUR) } } }
    const ok = describe_(github, { ...base, observed: { ...base.observed, lastPublish: { conclusion: 'success', latencyMs: 175_000 } } })
    assert.equal(ok.observedLatencyMs, 175_000)
    const failed = describe_(github, { ...base, observed: { ...base.observed, lastPublish: { conclusion: 'failure', latencyMs: 90_000 } } })
    assert.equal(failed.observedLatencyMs, undefined, 'a failed build is not a latency')
    assert.equal(describe_(github, base).observedLatencyMs, undefined, 'no measurement means no number, never an estimate')
  })

  test('garbage in the observed block cannot promote anything', () => {
    for (const observed of [
      { webhook: { lastSeenAt: 'yesterday' } },
      { webhook: { lastSeenAt: null } },
      { eventsPoll: { lastPolledAt: 'NaN' } },
      { webhook: {}, eventsPoll: {} },
      {},
      undefined,
    ]) {
      assert.equal(describe_(github, { deployment: deployed, observed }).effective, 'schedule', JSON.stringify(observed))
    }
  })

  test('a connector that declares no mechanism stays on the schedule even with a service deployed', () => {
    const npm = getConnector('npm')
    assert.equal(npm.sync, undefined)
    const d = describe_(npm, { deployment: deployed, observed: { webhook: { lastSeenAt: ago(60_000) } } })
    assert.equal(d.effective, 'schedule')
    assert.deepEqual(d.mechanisms, [])
  })
})

describe('declarations match the code beneath them', () => {
  test('every declared mechanism is complete and of a known kind', () => {
    for (const connector of CONNECTORS) {
      for (const m of connector.sync?.mechanisms ?? []) {
        assert.ok(['webhook', 'events-poll'].includes(m.kind), `${connector.id}: ${m.kind}`)
        assert.ok(m.latency && m.latency.length > 20, `${connector.id}/${m.kind} must say what latency to expect`)
      }
    }
  })

  test('only connectors with a verified mechanism declare one', () => {
    // Declaring a mechanism is a claim about a real provider, checked against it. This list
    // is the review prompt: adding a connector here means someone has probed its API.
    const declaring = CONNECTORS.filter((c) => c.sync).map((c) => c.id).sort()
    assert.deepEqual(declaring, ['github'])
  })

  test('GitHub\'s declared polling floor is the poller\'s floor', () => {
    const poll = github.sync.mechanisms.find((m) => m.kind === 'events-poll')
    assert.equal(poll.minIntervalSeconds * 1000, MIN_POLL_MS)
  })

  test('the setup instructions name every webhook event the parser needs', () => {
    const setup = github.sync.mechanisms.find((m) => m.kind === 'webhook').setup
    for (const event of GITHUB_WEBHOOK_EVENTS) {
      assert.ok(setup.includes(event), `setup omits "${event}": an owner following it would miss those events`)
    }
  })

  test('the declared polling latency does not undercut the provider\'s own cache', () => {
    // Probed: `Cache-Control: max-age=300`. A claim of "seconds" for polling would be false.
    const poll = github.sync.mechanisms.find((m) => m.kind === 'events-poll')
    assert.doesNotMatch(poll.latency, /^(instant|seconds|real-time)/i)
    assert.match(poll.latency, /minute/)
  })
})

describe('the refresh policy knows when a webhook can be received', () => {
  test('by default nothing can receive one', () => {
    const { webhook } = refreshPolicyFor(github, () => undefined)
    assert.equal(webhook.ingestible, false)
    assert.equal(webhook.providerSupports, true)
    assert.match(webhook.reason, /no sync service is configured/)
  })

  test('with a service deployed and a declared webhook, it can', () => {
    const { webhook } = refreshPolicyFor(github, () => undefined, deployed)
    assert.equal(webhook.ingestible, true)
    assert.match(webhook.reason, /configured to receive/)
  })

  test('a deployed service does not make a provider without a declared webhook ingestible', () => {
    const { webhook } = refreshPolicyFor(getConnector('npm'), () => undefined, deployed)
    assert.equal(webhook.ingestible, false)
  })

  test('an empty endpoint is not a deployment', () => {
    assert.equal(refreshPolicyFor(github, () => undefined, { endpoint: '' }).webhook.ingestible, false)
  })
})
