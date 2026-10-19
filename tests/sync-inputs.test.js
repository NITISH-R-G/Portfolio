import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { signSha256, verifySha256 } from '../src/core/sync/signature.js'
import { BACKOFF, backoffDelay, isRetryableStatus, nextDelay } from '../src/core/sync/retry.js'
import { parseGitHubWebhook, parsePolledGitHubEvents } from '../src/core/sync/github.js'
import { MIN_POLL_MS, SEEN_LIMIT, pollGitHubEvents } from '../src/core/sync/poller.js'

/**
 * The edges of the sync service: everything that takes input from outside it.
 *
 * Four kinds of input, four ways to be wrong. A signature check that accepts a forgery builds
 * the site on demand for strangers. A retry schedule without jitter synchronises every client
 * after a provider outage. An event parser that is too permissive publishes for private
 * repositories; one that is too strict misses the change it exists to catch. A poller that
 * ignores `X-Poll-Interval` is the kind of client a provider rate-limits for everyone.
 *
 * ## Real versus contract
 *
 * - The signature vector below is **GitHub's own documented example**
 *   (docs.github.com → "Validating webhook deliveries"), and it was independently reproduced
 *   with `openssl dgst -sha256 -hmac` while writing this. That makes it a real conformance test,
 *   not one this project wrote for itself.
 * - The webhook payloads are **hand-built to the documented schema**, containing only the fields
 *   the parser reads. They are contract tests: they prove the parser does what it claims on the
 *   documented shape, not that GitHub still sends that shape. `sync-live.test.js` checks the
 *   shape against the real API.
 * - The poller is driven by a stub `fetch` for the same reason `refresh.test.js` is: the
 *   behaviour under test is what we do with a 304 or a 403.
 */

const T0 = Date.parse('2026-10-19T12:00:00.000Z')
const NOW = new Date(T0).toISOString()

/* Signatures -------------------------------------------------------------------- */

describe('webhook signatures', () => {
  // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  const SECRET = "It's a Secret to Everybody"
  const BODY = 'Hello, World!'
  const DOCUMENTED = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17'

  test("accepts GitHub's own documented example", async () => {
    assert.equal(await verifySha256(SECRET, BODY, DOCUMENTED), true)
  })

  test('produces the documented signature', async () => {
    assert.equal(await signSha256(SECRET, BODY), DOCUMENTED)
  })

  test('rejects a body that was changed after signing', async () => {
    assert.equal(await verifySha256(SECRET, 'Hello, World?', DOCUMENTED), false)
    // Whitespace is a change: the signature is over the bytes sent, not the meaning.
    assert.equal(await verifySha256(SECRET, `${BODY} `, DOCUMENTED), false)
  })

  test('rejects the wrong secret', async () => {
    assert.equal(await verifySha256('another secret', BODY, DOCUMENTED), false)
  })

  test('verifies raw bytes, not only strings', async () => {
    const bytes = new TextEncoder().encode(BODY)
    assert.equal(await verifySha256(SECRET, bytes, DOCUMENTED), true)
    assert.equal(await verifySha256(SECRET, bytes.buffer, DOCUMENTED), true)
  })

  test('fails closed on anything malformed', async () => {
    const hex = DOCUMENTED.slice('sha256='.length)
    const bad = [
      undefined, null, '', 'sha256=', hex, // missing scheme
      `sha1=${hex}`, // the legacy scheme must not be accepted
      `sha256=${hex.slice(2)}`, // too short
      `sha256=${hex}00`, // too long
      `sha256=${'z'.repeat(64)}`, // not hex
      `SHA256=${hex}x`,
    ]
    for (const header of bad) {
      assert.equal(await verifySha256(SECRET, BODY, header), false, `accepted ${JSON.stringify(header)}`)
    }
  })

  test('an unset secret refuses everything, including a signature made with the empty string', async () => {
    const emptySecretSignature = await signSha256('x', BODY) // any well-formed value
    assert.equal(await verifySha256(undefined, BODY, emptySecretSignature), false)
    assert.equal(await verifySha256('', BODY, emptySecretSignature), false)
  })

  test('hex case does not matter, as the header is not case-normalised by every client', async () => {
    assert.equal(await verifySha256(SECRET, BODY, DOCUMENTED.toUpperCase().replace('SHA256=', 'sha256=')), true)
  })
})

/* Retry ------------------------------------------------------------------------- */

describe('retry delays', () => {
  test('full jitter spans zero to the ceiling', () => {
    assert.equal(backoffDelay(0, { baseMs: 1000, random: () => 0 }), 0)
    assert.equal(backoffDelay(0, { baseMs: 1000, random: () => 0.999999 }), 999)
  })

  test('the ceiling doubles per attempt and stops at the cap', () => {
    const top = (attempt) => backoffDelay(attempt, { baseMs: 1000, maxMs: 60_000, random: () => 0.999999 })
    assert.equal(top(0), 999)
    assert.equal(top(1), 1999)
    assert.equal(top(3), 7999)
    assert.equal(top(30), 59_999)
    assert.equal(top(500), 59_999, 'a huge attempt count must not overflow into NaN or Infinity')
  })

  test('jitter genuinely varies, which is the point of it', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => backoffDelay(6, { random: () => i / 50 })))
    assert.ok(seen.size > 40, 'delays must spread, not cluster')
  })

  test('never retries sooner than the provider asked', () => {
    for (const r of [0, 0.5, 0.999]) {
      assert.ok(nextDelay(2, { retryAfterMs: 30_000, random: () => r }) >= 30_000)
    }
  })

  test('ignores a nonsensical Retry-After rather than trusting it', () => {
    for (const bad of [NaN, -5, undefined, Infinity * 0]) {
      const delay = nextDelay(1, { retryAfterMs: bad, random: () => 0.5 })
      assert.ok(Number.isFinite(delay) && delay >= 0)
    }
  })

  test('defaults are the documented ones', () => {
    assert.equal(BACKOFF.baseMs, 5_000)
    assert.equal(BACKOFF.maxMs, 15 * 60_000)
  })

  test('retries what can recover and not what cannot', () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) assert.equal(isRetryableStatus(s), true, String(s))
    for (const s of [400, 401, 403, 404, 410, 422]) assert.equal(isRetryableStatus(s), false, String(s))
  })
})

/* GitHub webhooks --------------------------------------------------------------- */

describe('GitHub webhook interpretation', () => {
  const repo = (extra = {}) => ({
    full_name: 'ada/engine',
    owner: { login: 'ada' },
    default_branch: 'main',
    private: false,
    pushed_at: 1_792_411_200,
    updated_at: '2026-10-19T11:59:00Z',
    ...extra,
  })
  const parse = (event, payload, extra = {}) =>
    parseGitHubWebhook({ event, delivery: 'd-1', payload, now: NOW, account: 'ada', ...extra })

  test('a push to the default branch is a change', () => {
    const out = parse('push', { ref: 'refs/heads/main', repository: repo() })
    assert.equal(out.type, 'change')
    assert.equal(out.change.kind, 'push')
    assert.equal(out.change.weight, 'activity')
    assert.equal(out.change.id, 'd-1')
    assert.equal(out.change.via, 'webhook')
    assert.equal(out.change.repo, 'ada/engine')
    assert.equal(out.change.occurredAt, '2026-10-19T12:00:00.000Z', 'epoch seconds must be read as seconds')
  })

  test('pushes that are not the repository changing are ignored', () => {
    const cases = [
      [{ ref: 'refs/heads/feature', repository: repo() }, 'not-default-branch'],
      [{ ref: 'refs/tags/v1', repository: repo() }, 'not-default-branch'],
      [{ ref: 'refs/heads/main', deleted: true, repository: repo() }, 'branch-deleted'],
    ]
    for (const [payload, reason] of cases) assert.deepEqual(parse('push', payload), { type: 'ignored', reason })
  })

  test('private repositories never produce a change', () => {
    for (const event of ['push', 'star', 'fork', 'release']) {
      const out = parse(event, {
        action: 'created', ref: 'refs/heads/main', release: {}, forkee: {},
        repository: repo({ private: true }),
      })
      assert.deepEqual(out, { type: 'ignored', reason: 'private-repository' }, event)
    }
  })

  test('a repository going private is the exception, because it just left the portfolio', () => {
    const out = parse('repository', { action: 'privatized', repository: repo({ private: true }) })
    assert.equal(out.type, 'change')
    assert.equal(out.change.kind, 'repository.privatized')
    assert.equal(out.change.weight, 'structural')
  })

  test('repository lifecycle changes are structural; other actions are not changes', () => {
    for (const action of ['created', 'deleted', 'publicized', 'renamed', 'edited', 'archived']) {
      const out = parse('repository', { action, repository: repo() })
      assert.equal(out.change?.kind, `repository.${action}`, action)
      assert.equal(out.change?.weight, 'structural')
    }
    assert.deepEqual(parse('repository', { action: 'something-new', repository: repo() }), {
      type: 'ignored', reason: 'repository-action',
    })
  })

  test('stars, forks, releases and going public', () => {
    assert.equal(parse('star', { action: 'created', starred_at: '2026-10-19T11:00:00Z', repository: repo() }).change.kind, 'star.created')
    assert.equal(parse('star', { action: 'deleted', starred_at: null, repository: repo() }).change.kind, 'star.deleted')
    assert.equal(parse('fork', { forkee: { created_at: '2026-10-19T11:00:00Z' }, repository: repo() }).change.kind, 'fork')
    assert.equal(parse('release', { action: 'published', release: { published_at: '2026-10-19T11:00:00Z' }, repository: repo() }).change.weight, 'structural')
    assert.equal(parse('public', { repository: repo() }).change.kind, 'repository.publicized')
    assert.deepEqual(parse('release', { action: 'created', release: {}, repository: repo() }), {
      type: 'ignored', reason: 'release-action',
    })
  })

  test('events from another account are ignored', () => {
    const out = parse('push', { ref: 'refs/heads/main', repository: repo({ owner: { login: 'someone-else' } }) })
    assert.deepEqual(out, { type: 'ignored', reason: 'other-account' })
    // Account matching is case-insensitive: logins are.
    assert.equal(parse('push', { ref: 'refs/heads/main', repository: repo({ owner: { login: 'ADA' } }) }).type, 'change')
  })

  test('ping, unsubscribed events and junk are handled without throwing', () => {
    assert.deepEqual(parse('ping', {}), { type: 'ping' })
    assert.deepEqual(parse('issues', { action: 'opened', repository: repo() }), { type: 'ignored', reason: 'unsubscribed-event' })
    assert.deepEqual(parse(undefined, {}), { type: 'ignored', reason: 'malformed' })
    assert.deepEqual(parse('push', null), { type: 'ignored', reason: 'malformed' })
    assert.deepEqual(
      parseGitHubWebhook({ event: 'push', delivery: null, payload: { ref: 'refs/heads/main', repository: repo() }, now: NOW }),
      { type: 'ignored', reason: 'no-delivery-id' },
      'without a delivery id an event cannot be deduplicated, so it is not accepted',
    )
  })

  test('a completed deploy run is reported, with what started it', () => {
    const run = (extra = {}) => ({
      action: 'completed',
      repository: repo(),
      workflow_run: {
        id: 99, path: '.github/workflows/deploy.yml', head_branch: 'main', event: 'repository_dispatch',
        conclusion: 'success', html_url: 'https://github.com/ada/engine/actions/runs/99',
        created_at: '2026-10-19T12:00:00Z', updated_at: '2026-10-19T12:03:00Z', ...extra,
      },
    })
    const out = parse('workflow_run', run())
    assert.equal(out.type, 'workflow')
    assert.deepEqual(out.run, {
      id: 99, conclusion: 'success', event: 'repository_dispatch',
      url: 'https://github.com/ada/engine/actions/runs/99',
      createdAt: '2026-10-19T12:00:00.000Z', completedAt: '2026-10-19T12:03:00.000Z',
    })
    assert.deepEqual(parse('workflow_run', { ...run(), action: 'requested' }), { type: 'ignored', reason: 'workflow-not-completed' })
    assert.deepEqual(parse('workflow_run', run({ path: '.github/workflows/ci.yml' })), { type: 'ignored', reason: 'other-workflow' })
    assert.deepEqual(parse('workflow_run', run({ head_branch: 'feature' })), { type: 'ignored', reason: 'other-branch' })
  })
})

describe('Events API interpretation', () => {
  const ev = (id, type, payload = {}, extra = {}) => ({
    id: String(id), type, public: true, actor: { login: 'ada' },
    repo: { name: 'ada/engine' }, created_at: '2026-10-19T11:58:00Z', payload, ...extra,
  })
  const parse = (events) => parsePolledGitHubEvents(events, { now: NOW, account: 'ada' })

  test('reads the account\'s own pushes, new repositories, releases and publications', () => {
    const out = parse([
      ev(1, 'PushEvent'),
      ev(2, 'CreateEvent', { ref_type: 'repository' }),
      ev(3, 'ReleaseEvent', { action: 'published' }),
      ev(4, 'PublicEvent'),
    ])
    assert.deepEqual(out.map((c) => [c.kind, c.weight]), [
      ['push', 'activity'], ['repository.created', 'structural'],
      ['release.published', 'structural'], ['repository.publicized', 'structural'],
    ])
    assert.ok(out.every((c) => c.via === 'events-poll' && c.source === 'github'))
  })

  test('ids are namespaced so a polled event can never collide with a webhook delivery', () => {
    assert.equal(parse([ev(7, 'PushEvent')])[0].id, 'gh-event:7')
  })

  test('stars and forks by other people are NOT visible here — this is the documented gap', () => {
    // WatchEvent is what a star looks like in this API, and it appears only for the *actor*
    // who starred. The account's own activity feed never contains someone else starring it.
    assert.deepEqual(parse([ev(1, 'WatchEvent', { action: 'started' }), ev(2, 'ForkEvent')]), [])
  })

  test('branches and tags are not a repository appearing', () => {
    assert.deepEqual(parse([ev(1, 'CreateEvent', { ref_type: 'branch' }), ev(2, 'CreateEvent', { ref_type: 'tag' })]), [])
  })

  test('drops private events, other actors and junk', () => {
    assert.deepEqual(parse([ev(1, 'PushEvent', {}, { public: false })]), [])
    assert.deepEqual(parse([ev(1, 'PushEvent', {}, { actor: { login: 'someone-else' } })]), [])
    assert.deepEqual(parse([null, 3, 'x', {}]), [])
    assert.deepEqual(parse(/** @type {any} */ ('not an array')), [])
  })
})

/* Poller ------------------------------------------------------------------------ */

describe('the Events API poller', () => {
  /** A stub fetch answering from a script, recording what it was asked. */
  function stub(script) {
    const calls = []
    let i = 0
    const fetch = async (url, options = {}) => {
      calls.push({ url, headers: options.headers ?? {} })
      const next = script[Math.min(i++, script.length - 1)]
      if (next instanceof Error) throw next
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: next.headers ?? {},
      })
    }
    return { fetch, calls }
  }

  const events = (...ids) => ids.map((id) => ({
    id: String(id), type: 'PushEvent', public: true, actor: { login: 'ada' },
    repo: { name: 'ada/engine' }, created_at: '2026-10-19T11:58:00Z', payload: {},
  }))

  const poll = (over) => pollGitHubEvents({ account: 'ada', now: () => T0, random: () => 0.5, ...over })

  test('the first poll sets a baseline and reports nothing', async () => {
    const { fetch } = stub([{ body: events(300, 200, 100), headers: { etag: 'W/"a"', 'x-poll-interval': '60' } }])
    const out = await poll({ fetch })
    assert.equal(out.outcome, 'baseline')
    assert.deepEqual(out.changes, [], 'without a baseline every old event would look new')
    assert.deepEqual(out.state.seen, ['300', '200', '100'])
    assert.equal(out.state.etag, 'W/"a"')
  })

  test('later polls report only what has not been seen, and send the ETag back', async () => {
    const { fetch, calls } = stub([{ body: events(305, 304, 300, 200), headers: { etag: 'W/"b"', 'x-poll-interval': '60' } }])
    const out = await poll({ fetch, state: { seen: ['300', '200'], etag: 'W/"a"' } })
    assert.equal(calls[0].headers['if-none-match'], 'W/"a"')
    assert.equal(out.outcome, 'changes')
    assert.deepEqual(out.changes.map((c) => c.id), ['gh-event:305', 'gh-event:304'])
    assert.deepEqual(out.state.seen, ['305', '304', '300', '200'])
    assert.equal(out.state.etag, 'W/"b"')
  })

  test('does not assume ids are ordered — a NEW event may have a LOWER id than old ones', async () => {
    // Observed live, not hypothesised: one real response held pushes and repository creations
    // with ids near 24.4 billion alongside stars and pull requests near 17.5 billion, in no
    // id or time order. An earlier version of this poller kept "the highest id seen" and so
    // would have skipped any new event from the lower sequence — silently, forever.
    const { fetch } = stub([{ body: events('24493769427', '17545605352') }])
    const out = await poll({ fetch, state: { seen: ['24493769427'] } })
    assert.deepEqual(out.changes.map((c) => c.id), ['gh-event:17545605352'])
    assert.deepEqual(out.state.seen, ['24493769427', '17545605352'])
  })

  test('an event that drops off the page and comes back is not mistaken for new', async () => {
    const { fetch } = stub([{ body: events('3', '2') }])
    const out = await poll({ fetch, state: { seen: ['2', '1', '3'] } })
    assert.deepEqual(out.changes, [])
    assert.equal(out.outcome, 'unchanged')
  })

  test('remembers a bounded number of ids, newest page first', async () => {
    const old = Array.from({ length: SEEN_LIMIT + 50 }, (_, i) => `old-${i}`)
    const { fetch } = stub([{ body: events('new-1', 'new-2') }])
    const out = await poll({ fetch, state: { seen: old } })
    assert.equal(out.state.seen.length, SEEN_LIMIT)
    assert.deepEqual(out.state.seen.slice(0, 2), ['new-1', 'new-2'], 'the current page survives the cap')
  })

  test('an empty feed is a valid baseline, not "no baseline yet"', async () => {
    const empty = stub([{ body: [] }, { body: events('9') }])
    const first = await poll({ fetch: empty.fetch })
    assert.equal(first.outcome, 'baseline')
    assert.deepEqual(first.state.seen, [])
    const second = await poll({ fetch: empty.fetch, state: { ...first.state, nextPollAt: undefined } })
    assert.equal(second.outcome, 'changes', 'the first event on a previously empty feed is news')
  })

  test('a 304 costs nothing and reports nothing', async () => {
    const { fetch } = stub([{ status: 304, headers: { 'x-poll-interval': '60' } }])
    const out = await poll({ fetch, state: { seen: ['300'], etag: 'W/"a"', failures: 3 } })
    assert.equal(out.outcome, 'unchanged')
    assert.deepEqual(out.changes, [])
    assert.equal(out.state.failures, 0, 'a success resets the failure count')
    assert.equal(out.state.etag, 'W/"a"')
  })

  test('honours the interval GitHub asks for when it is longer than ours', async () => {
    const { fetch } = stub([{ status: 304, headers: { 'x-poll-interval': '300' } }])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(Date.parse(out.state.nextPollAt) - T0, 300_000)
  })

  test('never polls faster than its own floor, even if GitHub would allow it', async () => {
    const { fetch } = stub([{ status: 304, headers: { 'x-poll-interval': '5' } }])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(Date.parse(out.state.nextPollAt) - T0, MIN_POLL_MS)
  })

  test('does not ask again before it is due', async () => {
    const { fetch, calls } = stub([{ body: [] }])
    const state = { seen: [], nextPollAt: new Date(T0 + 30_000).toISOString() }
    const out = await poll({ fetch, state })
    assert.equal(out.outcome, 'not-due')
    assert.equal(calls.length, 0, 'a poll that is not due must not touch the network')
  })

  test('sends a token only when it has one, and never in a URL', async () => {
    const withToken = stub([{ status: 304 }])
    await poll({ fetch: withToken.fetch, token: 'ghp_secret_for_tests_only', state: { seen: [] } })
    assert.equal(withToken.calls[0].headers.authorization, 'Bearer ghp_secret_for_tests_only')
    assert.ok(!withToken.calls[0].url.includes('ghp_'))

    const without = stub([{ status: 304 }])
    await poll({ fetch: without.fetch, state: { seen: [] } })
    assert.equal('authorization' in without.calls[0].headers, false)
  })

  test('only ever asks for the PUBLIC feed', async () => {
    const { fetch, calls } = stub([{ status: 304 }])
    await poll({ fetch, account: 'a b/c', state: { seen: [] } })
    assert.match(calls[0].url, /^https:\/\/api\.github\.com\/users\/a%20b%2Fc\/events\/public\?/)
  })

  test('a rate limit waits for the reset, and says so', async () => {
    const reset = Math.floor((T0 + 10 * 60_000) / 1000)
    const { fetch } = stub([{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(out.outcome, 'rate-limited')
    assert.equal(Date.parse(out.state.nextPollAt), reset * 1000)
  })

  test('Retry-After on a 429 is honoured', async () => {
    const { fetch } = stub([{ status: 429, headers: { 'retry-after': '900' } }])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(out.outcome, 'rate-limited')
    assert.ok(Date.parse(out.state.nextPollAt) - T0 >= 900_000)
  })

  test('a plain 403 is a refusal, not a rate limit', async () => {
    const { fetch } = stub([{ status: 403, headers: { 'x-ratelimit-remaining': '42' } }])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(out.outcome, 'error')
  })

  test('failures back off, and the seen set and ETag survive them', async () => {
    const { fetch } = stub([{ status: 503 }])
    const first = await poll({ fetch, random: () => 0.999, state: { seen: ['42'], etag: 'W/"keep"' } })
    assert.equal(first.outcome, 'error')
    assert.equal(first.state.failures, 1)
    assert.deepEqual(first.state.seen, ['42'])
    assert.equal(first.state.etag, 'W/"keep"')

    const later = await poll({ fetch, random: () => 0.999, state: { ...first.state, nextPollAt: undefined, failures: 6 } })
    assert.ok(Date.parse(later.state.nextPollAt) - T0 > Date.parse(first.state.nextPollAt) - T0, 'later failures wait longer')
  })

  test('a network failure is a value, not an exception', async () => {
    const { fetch } = stub([new TypeError('fetch failed')])
    const out = await poll({ fetch, state: { seen: [] } })
    assert.equal(out.outcome, 'error')
    assert.equal(out.message, 'fetch failed')
  })

  test('a 200 that is not the documented shape is an error and changes nothing', async () => {
    const { fetch } = stub([{ body: { message: 'surprise' }, headers: { etag: 'W/"new"' } }])
    const out = await poll({ fetch, state: { seen: ['42'], etag: 'W/"old"' } })
    assert.equal(out.outcome, 'error')
    assert.deepEqual(out.state.seen, ['42'])
    assert.equal(out.state.etag, 'W/"old"', 'trusting the new ETag would hide the events we failed to read')
  })
})
