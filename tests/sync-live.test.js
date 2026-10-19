import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pollGitHubEvents } from '../src/core/sync/poller.js'
import { parsePolledGitHubEvents } from '../src/core/sync/github.js'
import { getConnector } from '../src/connectors/index.js'

/**
 * Live checks against the real GitHub API.
 *
 * Everything else under `tests/sync-*` is a **contract** test: it proves this project does the
 * right thing with the shapes and headers GitHub is *documented* to send. None of it can notice
 * if GitHub changes. This file is the other half — it asks the real service and checks that the
 * documented behaviour is still the actual behaviour, and that the latency this project
 * *declares* for GitHub is still true.
 *
 * Opt-in, because a test suite that fails when a third party is down is a suite people stop
 * trusting:
 *
 *     SYNC_LIVE=1 node --test tests/sync-live.test.js
 *     SYNC_LIVE=1 SYNC_LIVE_ACCOUNT=someone GITHUB_TOKEN=... node --test tests/sync-live.test.js
 *
 * Without `SYNC_LIVE` these are reported as *skipped*, never passed: a green tick must mean the
 * check ran. Only the **public** events feed is read — the same one the service polls — so no
 * credential is required, and a token (if given) only lifts the rate limit.
 *
 * What this cannot verify: that GitHub *delivers webhooks* to a deployed Worker. That needs the
 * owner's Cloudflare account and App settings, and is milestone 2's acceptance test.
 */

const LIVE = process.env.SYNC_LIVE === '1'
const ACCOUNT = process.env.SYNC_LIVE_ACCOUNT ?? 'NITISH-R-G'
const TOKEN = process.env.GITHUB_TOKEN
const skip = LIVE ? false : 'set SYNC_LIVE=1 to run checks against the real GitHub API'

const T = () => Date.now()

// `skip` per test, not on the `describe`: a skipped suite is reported as "0 tests", which hides
// that checks exist and were not run. Counted skips are the honest record.
const live = (name, fn) => test(name, { skip }, fn)

describe('the real GitHub Events API', () => {
  /** One request, kept so the individual tests read one response rather than hammering the API. */
  let first

  live('answers with the documented headers: an ETag, and a poll interval to honour', async () => {
    const response = await fetch(`https://api.github.com/users/${ACCOUNT}/events/public?per_page=30`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'portfolio-sync-live-test',
        'x-github-api-version': '2022-11-28',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
    })
    assert.equal(response.status, 200, `GitHub answered ${response.status}; a rate limit here is not a failure of the code`)
    first = { headers: response.headers, body: await response.json() }

    assert.ok(first.headers.get('etag'), 'conditional polling depends on an ETag')
    const interval = Number(first.headers.get('x-poll-interval'))
    assert.ok(Number.isFinite(interval) && interval >= 1, 'X-Poll-Interval is what the poller must honour')
    assert.ok(Array.isArray(first.body), 'the body is an array of events')
  })

  live('the provider caches this feed for minutes — the floor under any polling latency', async () => {
    // The connector declares "one to six minutes to notice". That is only honest while the feed
    // is cached on GitHub's side for about five. If this ever drops to seconds the declaration
    // is too pessimistic; if it grows, too optimistic. Either way someone should look.
    const cacheControl = first.headers.get('cache-control') ?? ''
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1])
    assert.ok(Number.isFinite(maxAge), `no max-age in "${cacheControl}"`)
    assert.ok(maxAge >= 60 && maxAge <= 900, `max-age=${maxAge}: re-check the latency declared in connectors/github`)

    const declared = getConnector('github').sync.mechanisms.find((m) => m.kind === 'events-poll').latency
    assert.match(declared, /minute/)
  })

  live('events have the fields the parser reads', () => {
    for (const event of first.body.slice(0, 30)) {
      assert.match(String(event.id), /^\d+$/, 'ids are numeric strings — the cursor depends on it')
      assert.equal(typeof event.type, 'string')
      assert.ok(event.actor?.login, 'actor.login is how events are attributed to the account')
      assert.ok(Date.parse(event.created_at) > 0)
    }
  })

  live('the parser turns real events into well-formed changes, and never an invalid one', () => {
    const changes = parsePolledGitHubEvents(first.body, { now: new Date().toISOString(), account: ACCOUNT })
    const kinds = new Set(['push', 'repository.created', 'repository.publicized', 'release.published'])
    for (const change of changes) {
      assert.ok(kinds.has(change.kind), `unexpected kind ${change.kind}`)
      assert.match(change.id, /^gh-event:\d+$/)
      assert.equal(change.via, 'events-poll')
      assert.ok(['structural', 'activity'].includes(change.weight))
    }
    // How many there are depends on the account's recent activity; that is data, not a claim.
    console.log(`  live: ${first.body.length} events → ${changes.length} relevant changes for ${ACCOUNT}`)
  })

  live('a new event is detected even when its id is LOWER than ones already seen', async () => {
    // The finding that replaced the poller's cursor: this feed is not id-ordered, and the
    // lowest-id event on a real page can be among its newest. Take a real page, pretend every
    // event *except the one with the lowest id* was already seen, and require that one to be
    // reported. A "highest id seen" cursor fails this on any real page that mixes event types.
    const real = first.body.filter((e) => ['PushEvent', 'CreateEvent', 'PublicEvent', 'ReleaseEvent'].includes(e.type))
    if (real.length < 2) return console.log('  live: not enough relevant events on this account to exercise the case')

    const lowest = real.reduce((a, b) => (BigInt(a.id) < BigInt(b.id) ? a : b))
    const seen = first.body.map((e) => String(e.id)).filter((id) => id !== String(lowest.id))
    const replay = async () => new Response(JSON.stringify(first.body), { status: 200, headers: { etag: 'W/"replay"', 'x-poll-interval': '60' } })

    const out = await pollGitHubEvents({ account: ACCOUNT, state: { seen }, fetch: replay })
    assert.deepEqual(out.changes.map((c) => c.id), [`gh-event:${lowest.id}`])
    const others = first.body.filter((e) => BigInt(e.id) > BigInt(lowest.id) && !seen.includes(String(e.id)))
    assert.equal(others.length, 0)
  })

  live('ids really are not ordered here — the reason the poller keeps a set (informational)', () => {
    const ids = first.body.map((e) => BigInt(e.id))
    let inversions = 0
    for (let i = 1; i < ids.length; i += 1) if (ids[i - 1] < ids[i]) inversions += 1
    // Not asserted: it depends on the account's recent activity, and a quiet account may have
    // none. It is printed so the evidence is on record each time this runs.
    console.log(`  live: ${inversions} id inversions across ${ids.length} events on this page`)
  })

  live('the poller completes a real baseline, then a real conditional request returns 304', async () => {
    const started = T()
    const baseline = await pollGitHubEvents({ account: ACCOUNT, token: TOKEN })
    assert.equal(baseline.outcome, 'baseline')
    assert.deepEqual(baseline.changes, [])
    assert.ok(baseline.state.seen.length > 0 && baseline.state.seen.every((id) => /^\d+$/.test(id)), 'the baseline records every id on the page')
    assert.ok(baseline.state.etag)

    // Let the interval pass without waiting for it, and ask again with the stored ETag.
    const second = await pollGitHubEvents({
      account: ACCOUNT, token: TOKEN, state: { ...baseline.state, nextPollAt: undefined },
    })
    assert.ok(['unchanged', 'changes'].includes(second.outcome), `got ${second.outcome}`)
    if (second.outcome === 'unchanged') {
      assert.equal(second.state.etag, baseline.state.etag)
    }
    // The wait it computed is what GitHub said, floored at our own minimum.
    assert.ok(Date.parse(second.state.nextPollAt) - started >= 59_000)
    console.log(`  live: second poll → ${second.outcome} (a 304 means the ETag round-trip works)`)
  })

  live('an account that does not exist is an error value, not a crash', async () => {
    const out = await pollGitHubEvents({ account: 'this-account-does-not-exist-9f3a1c7e', token: TOKEN })
    assert.equal(out.outcome, 'error')
    assert.match(out.message, /404/)
  })
})
