import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CONNECTORS, getConnector } from '../src/connectors/index.js'
import { createHttpClient, isRateLimited, retryAfterMs } from '../src/connectors/http.js'
import { cacheKey, conditionalHeaders, createHttpCache, validatorOf } from '../src/connectors/cache.js'
import { runConnectors } from '../src/connectors/run.js'
import { deriveHealth, STALE_AFTER_DAYS } from '../src/core/sources/health.js'
import { refreshPolicyFor, summarizeRefresh, SCHEDULE } from '../src/core/sources/refresh.js'

/**
 * Automatic maintenance: conditional fetching, failure isolation, and honest capability.
 *
 * The failures worth defending against here are all the quiet kind. A source that stops
 * refreshing and reports success. A failed run that wipes the last good data. A rate limit
 * reported as a configuration error. A schedule the UI promises and the infrastructure cannot
 * keep. None of these look like bugs from the outside — the portfolio simply goes wrong slowly.
 *
 * The HTTP tests drive a stub `fetch`, because the behaviour under test is what this project
 * does with a 304 or a 403, not whether a provider sends one. Which providers genuinely do was
 * established by probing them directly; see `connectors/cache.js`.
 */

/** A fetch stub that answers from a script and records what it was asked. */
function stubFetch(responses) {
  const calls = []
  let i = 0
  const doFetch = async (url, options = {}) => {
    calls.push({ url, headers: options.headers ?? {} })
    const next = responses[Math.min(i, responses.length - 1)]
    i += 1
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: new Headers(next.headers ?? {}),
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    }
  }
  return { doFetch, calls }
}

/* -------------------------------------------------------------------------- */
/* D. Conditional fetching                                                    */
/* -------------------------------------------------------------------------- */

describe('conditional requests, where the provider offers them', () => {
  test('a validator is stored and offered back on the next request', async () => {
    const cache = createHttpCache()
    const first = stubFetch([{ status: 200, headers: { etag: 'W/"abc"' }, body: { v: 1 } }])
    const a = createHttpClient({ fetch: first.doFetch, cache })
    assert.deepEqual(await a.json('https://example.test/x'), { v: 1 })
    assert.equal(first.calls[0].headers['if-none-match'], undefined, 'nothing to revalidate on a first request')

    const second = stubFetch([{ status: 304 }])
    const b = createHttpClient({ fetch: second.doFetch, cache })
    assert.deepEqual(await b.json('https://example.test/x'), { v: 1 }, 'a 304 must return the stored body')
    assert.equal(second.calls[0].headers['if-none-match'], 'W/"abc"')
    assert.equal(b.revalidatedCount(), 1)
  })

  test('a provider that sends no validator never receives a conditional header', async () => {
    // The rule that keeps this honest across twenty connectors: support is discovered from the
    // response, never declared. Nothing has to know which providers do and do not.
    const cache = createHttpCache()
    const first = stubFetch([{ status: 200, body: { v: 1 } }])
    await createHttpClient({ fetch: first.doFetch, cache }).json('https://no-validator.test/x')

    const second = stubFetch([{ status: 200, body: { v: 2 } }])
    const b = createHttpClient({ fetch: second.doFetch, cache })
    assert.deepEqual(await b.json('https://no-validator.test/x'), { v: 2 })
    // The client always sends its user-agent and accept headers; what must be absent is any
    // conditional header, since the provider never gave anything to revalidate against.
    assert.equal(second.calls[0].headers['if-none-match'], undefined, 'a validator was invented')
    assert.equal(second.calls[0].headers['if-modified-since'], undefined, 'a validator was invented')
    assert.equal(b.revalidatedCount(), 0)
  })

  test('Last-Modified is used when that is all the provider gives', async () => {
    const cache = createHttpCache()
    const lm = 'Wed, 21 Oct 2026 07:28:00 GMT'
    const first = stubFetch([{ status: 200, headers: { 'last-modified': lm }, body: { v: 1 } }])
    await createHttpClient({ fetch: first.doFetch, cache }).json('https://example.test/y')

    const second = stubFetch([{ status: 304 }])
    const b = createHttpClient({ fetch: second.doFetch, cache })
    assert.deepEqual(await b.json('https://example.test/y'), { v: 1 })
    assert.equal(second.calls[0].headers['if-modified-since'], lm)
  })

  test('a 200 replaces the cached body rather than reusing it', async () => {
    // The failure this guards: treating a stored body as current without the provider saying
    // so. Only a 304 may reuse it.
    const cache = createHttpCache()
    const first = stubFetch([{ status: 200, headers: { etag: '"1"' }, body: { v: 1 } }])
    await createHttpClient({ fetch: first.doFetch, cache }).json('https://example.test/z')

    const second = stubFetch([{ status: 200, headers: { etag: '"2"' }, body: { v: 2 } }])
    const b = createHttpClient({ fetch: second.doFetch, cache })
    assert.deepEqual(await b.json('https://example.test/z'), { v: 2 })
    assert.equal(b.revalidatedCount(), 0)
  })

  test('without a cache the client behaves exactly as it always did', async () => {
    const { doFetch, calls } = stubFetch([{ status: 200, headers: { etag: '"1"' }, body: { v: 1 } }])
    const client = createHttpClient({ fetch: doFetch })
    assert.deepEqual(await client.json('https://example.test/x'), { v: 1 })
    assert.equal(calls[0].headers['if-none-match'], undefined)
    assert.equal(calls[0].headers['if-modified-since'], undefined)
    assert.equal(client.revalidatedCount(), 0)
  })

  test('the cache key separates methods and query strings', () => {
    assert.notEqual(cacheKey('https://a.test/x', 'GET'), cacheKey('https://a.test/x', 'HEAD'))
    assert.notEqual(cacheKey('https://a.test/x?page=1'), cacheKey('https://a.test/x?page=2'))
  })

  test('stale entries are dropped when the store loads', () => {
    const old = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const cache = createHttpCache({
      'GET https://a.test/x': { etag: '"1"', body: 1, storedAt: old },
      'GET https://a.test/y': { etag: '"2"', body: 2, storedAt: new Date().toISOString() },
    })
    assert.equal(cache.get('GET https://a.test/x'), undefined)
    assert.ok(cache.get('GET https://a.test/y'))
  })

  test('conditionalHeaders and validatorOf refuse to invent anything', () => {
    assert.deepEqual(conditionalHeaders(undefined), {})
    assert.deepEqual(conditionalHeaders({ body: 1, storedAt: 'x' }), {})
    assert.equal(validatorOf(new Headers({})), undefined)
    assert.deepEqual(validatorOf(new Headers({ etag: '"a"' })), { etag: '"a"' })
  })
})

/* -------------------------------------------------------------------------- */
/* G. Rate limits are distinguishable                                         */
/* -------------------------------------------------------------------------- */

describe('a rate limit is not a generic failure', () => {
  test('429 is a rate limit', () => {
    assert.equal(isRateLimited(429, new Headers({})), true)
  })

  test('a 403 with an exhausted quota header is a rate limit', () => {
    // GitHub's actual behaviour, and the reason this exists: without the header check its
    // rate limit reads as "refused the request", sending the user after a permissions problem
    // that is not there.
    assert.equal(isRateLimited(403, new Headers({ 'x-ratelimit-remaining': '0' })), true)
  })

  test('a plain 403 is not promoted to a rate limit', () => {
    assert.equal(isRateLimited(403, new Headers({})), false)
    assert.equal(isRateLimited(403, new Headers({ 'x-ratelimit-remaining': '57' })), false)
  })

  test('other failures are never rate limits', () => {
    for (const status of [400, 401, 404, 422, 500, 503]) {
      assert.equal(isRateLimited(status, new Headers({})), false, String(status))
    }
  })

  test('the error carries the flag and the retry time', async () => {
    const reset = Math.floor((Date.now() + 600_000) / 1000)
    const { doFetch } = stubFetch([
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } },
    ])
    const client = createHttpClient({ fetch: doFetch, retries: 0 })
    await assert.rejects(
      () => client.json('https://api.test/x', { platform: 'TestHub' }),
      (err) => {
        assert.equal(err.rateLimited, true)
        assert.match(err.message, /rate limit reached/i)
        assert.ok(err.retryAfterMs > 0, 'the reset time should be carried')
        return true
      },
    )
  })

  test('Retry-After is honoured in both of its forms', () => {
    const now = Date.now()
    assert.equal(retryAfterMs(new Headers({ 'retry-after': '120' }), now), 120_000)
    const at = new Date(now + 60_000).toUTCString()
    const ms = retryAfterMs(new Headers({ 'retry-after': at }), now)
    assert.ok(ms > 50_000 && ms <= 60_000, `expected about a minute, got ${ms}`)
  })
})

/* -------------------------------------------------------------------------- */
/* F. Failure isolation                                                       */
/* -------------------------------------------------------------------------- */

describe('one source failing leaves the others alone', () => {
  /** A run where the second of three connectors always fails. */
  const run = (previous = {}, previousProfiles = {}) => runConnectors({
    dataSources: { npm: { username: 'a' }, pypi: { username: 'b' }, devto: { username: 'c' } },
    previous,
    previousProfiles,
    now: Date.parse('2026-09-08T00:00:00Z'),
    fetch: async (url) => {
      if (url.includes('pypi')) {
        return { ok: false, status: 500, headers: new Headers({}), json: async () => ({}), text: async () => '' }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({}),
        json: async () => ({}),
        text: async () => '{}',
      }
    },
  })

  test('a failing source does not abort the others', async () => {
    const { status } = await run()
    assert.equal(Object.keys(status).length, 3, 'every source must be reported')
    assert.equal(status.pypi.state, 'error')
    // The others each reached a terminal state of their own rather than being cancelled.
    for (const key of ['npm', 'devto']) {
      assert.notEqual(status[key].state, undefined, `${key} produced no status`)
    }
  })

  test('lastSuccessfulAt survives a failure and lastAttemptedAt advances', async () => {
    const previous = {
      pypi: {
        connector: 'pypi', name: 'PyPI', state: 'imported', message: 'ok',
        lastSuccessfulAt: '2026-01-01T00:00:00Z',
        lastAttemptedAt: '2026-01-01T00:00:00Z',
      },
    }
    const { status } = await run(previous)
    assert.equal(status.pypi.state, 'error')
    assert.equal(status.pypi.lastSuccessfulAt, '2026-01-01T00:00:00Z', 'a failure erased the memory of success')
    assert.equal(status.pypi.lastAttemptedAt, '2026-09-08T00:00:00.000Z')
    assert.notEqual(status.pypi.lastAttemptedAt, status.pypi.lastSuccessfulAt)
  })

  test('a failed source contributes no profile, so its previous data is left in place', async () => {
    const { sources } = await run()
    // The importer only overwrites files for sources that produced something; a source absent
    // from this list keeps whatever is on disk.
    assert.ok(!sources.some((source) => source.key === 'pypi'), 'a failed source must not be written')
  })
})

/* -------------------------------------------------------------------------- */
/* H/J. Health states are distinct and meaningful                             */
/* -------------------------------------------------------------------------- */

describe('stale, never-synced and rate-limited are different things', () => {
  const github = getConnector('github')
  const now = Date.parse('2026-09-08T00:00:00Z')
  const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString()

  test('a source that has never succeeded is never-run, not stale', () => {
    // The distinction the brief asks for. "Stale" implies there is something to go back to.
    const health = deriveHealth({ key: 'github', connector: github, status: undefined, now })
    assert.equal(health.state, 'never-run')
    assert.equal(health.stale, false)
    assert.equal(health.lastSuccessfulAt, undefined)
  })

  test('a previously healthy source goes stale past the threshold', () => {
    const health = deriveHealth({
      key: 'github',
      connector: github,
      status: { state: 'imported', message: 'ok', lastSuccessfulAt: daysAgo(STALE_AFTER_DAYS + 1) },
      now,
    })
    assert.equal(health.state, 'stale')
    assert.equal(health.stale, true)
    assert.ok(health.lastSuccessfulAt, 'stale means there was a success to go back to')
  })

  test('a recent success is not stale', () => {
    const health = deriveHealth({
      key: 'github', connector: github,
      status: { state: 'imported', message: 'ok', lastSuccessfulAt: daysAgo(1) },
      now,
    })
    assert.equal(health.state, 'connected')
    assert.equal(health.stale, false)
  })

  test('a source that cannot be fetched never goes stale', () => {
    // Telling someone to refresh a manual entry is telling them to do nothing.
    const health = deriveHealth({
      key: 'linkedin', connector: getConnector('linkedin'),
      status: { state: 'manual', message: 'ok', lastSuccessfulAt: daysAgo(400) },
      now,
    })
    assert.equal(health.stale, false)
    assert.equal(health.canRefresh, false)
  })

  test('a rate limit reads as rate-limited, and is not something to fix', () => {
    const health = deriveHealth({
      key: 'github', connector: github,
      status: { state: 'error', rateLimited: true, message: 'rate limit', lastSuccessfulAt: daysAgo(1) },
      now,
    })
    assert.equal(health.state, 'rate-limited')
    assert.equal(health.actionable, false, 'waiting is not an action the user can take')
  })

  test('a missing credential reads as authentication-required, and is', () => {
    const health = deriveHealth({
      key: 'kaggle', connector: getConnector('kaggle'),
      status: { state: 'unavailable', message: 'needs a key' },
      now,
    })
    assert.equal(health.state, 'authentication-required')
    assert.equal(health.actionable, true)
  })

  test('the stale threshold is one global number, not a per-source guess', () => {
    assert.equal(STALE_AFTER_DAYS, 14)
    assert.equal(typeof STALE_AFTER_DAYS, 'number')
  })
})

/* -------------------------------------------------------------------------- */
/* B/C/I/L. Capability is honest                                              */
/* -------------------------------------------------------------------------- */

describe('what a source promises about keeping itself current', () => {
  test('a fetchable connector with no credential requirement refreshes automatically', () => {
    for (const id of ['github', 'devto', 'npm', 'orcid']) {
      assert.equal(refreshPolicyFor(getConnector(id)).mode, 'automatic', id)
    }
  })

  test('a credential-gated connector is blocked until the credential exists', () => {
    const without = refreshPolicyFor(getConnector('kaggle'), () => undefined)
    assert.equal(without.mode, 'blocked')
    assert.equal(without.safeInCI, false)
    assert.match(without.summary, /KAGGLE_USERNAME/)

    const with_ = refreshPolicyFor(getConnector('kaggle'), () => 'present')
    assert.equal(with_.mode, 'automatic')
  })

  test('the summary names the variable but never its value', () => {
    const policy = refreshPolicyFor(getConnector('kaggle'), () => 'super-secret-value')
    assert.doesNotMatch(JSON.stringify(policy), /super-secret-value/)
  })

  test('a connector with nothing to fetch offers no automatic refresh', () => {
    assert.equal(refreshPolicyFor(getConnector('linkedin')).mode, 'manual')
    assert.equal(refreshPolicyFor(getConnector('x')).mode, 'unsupported')
    for (const id of ['linkedin', 'x', 'googleScholar']) {
      assert.equal(refreshPolicyFor(getConnector(id)).safeInCI, false, id)
      assert.equal(refreshPolicyFor(getConnector(id)).conditional, 'none', id)
    }
  })

  test('every connector in the registry gets a policy, and none is invented', () => {
    const modes = new Set(['automatic', 'blocked', 'manual', 'unsupported'])
    for (const connector of CONNECTORS) {
      const policy = refreshPolicyFor(connector)
      assert.ok(modes.has(policy.mode), `${connector.id}: ${policy.mode}`)
      assert.ok(policy.summary.length > 10, connector.id)
    }
  })

  test('refresh capability agrees with health’s canRefresh', () => {
    // Two answers to "can this be refreshed" must not be able to disagree.
    for (const connector of CONNECTORS) {
      const policy = refreshPolicyFor(connector, () => 'set')
      const health = deriveHealth({ key: connector.id, connector, status: undefined })
      const policySaysYes = policy.mode === 'automatic'
      assert.equal(policySaysYes, health.canRefresh, connector.id)
    }
  })

  test('cadence is the repository schedule, and is never per-source', () => {
    // The stop condition, asserted. GitHub Actions cannot run independent per-source crons, so
    // nothing may report one.
    assert.equal(SCHEDULE.perSource, false)
    assert.equal(SCHEDULE.cron, '0 6 * * 1')
    for (const connector of CONNECTORS) {
      assert.deepEqual(refreshPolicyFor(connector).cadence, SCHEDULE, connector.id)
    }
  })

  test('no connector claims an hourly or daily schedule', () => {
    const text = CONNECTORS.map((c) => JSON.stringify(refreshPolicyFor(c))).join(' ')
    assert.doesNotMatch(text, /hourly|every hour|daily|every day/i)
  })

  test('no source claims a webhook can reach this project', () => {
    for (const connector of CONNECTORS) {
      const { webhook } = refreshPolicyFor(connector)
      assert.equal(webhook.ingestible, false, `${connector.id} claims webhook ingestion`)
      assert.ok(webhook.reason.length > 10)
    }
  })

  test('provider webhook support is recorded separately from ingestion', () => {
    // The distinction the brief insists on: the provider having webhooks is not the same as
    // this project being able to receive one.
    assert.equal(refreshPolicyFor(getConnector('github')).webhook.providerSupports, true)
    assert.equal(refreshPolicyFor(getConnector('github')).webhook.ingestible, false)
    assert.equal(refreshPolicyFor(getConnector('leetcode')).webhook.providerSupports, false)
  })

  test('the rollup adds up to every configured source', () => {
    const policies = CONNECTORS.map((c) => refreshPolicyFor(c))
    const s = summarizeRefresh(policies)
    assert.equal(s.automatic + s.blocked + s.manual + s.unsupported, CONNECTORS.length)
    assert.equal(s.total, CONNECTORS.length)
  })
})

/* -------------------------------------------------------------------------- */
/* M. Credentials stay out of everything                                      */
/* -------------------------------------------------------------------------- */

describe('credentials never enter generated state', () => {
  test('a run’s status carries no credential value', async () => {
    const secret = 'ghp_thisisasecrettokenvalue0000'
    const { status } = await runConnectors({
      dataSources: { devto: { username: 'a' } },
      env: () => secret,
      now: Date.now(),
      fetch: async () => ({
        ok: true, status: 200, headers: new Headers({}),
        json: async () => [], text: async () => '[]',
      }),
    })
    assert.doesNotMatch(JSON.stringify(status), new RegExp(secret))
  })

  test('a refresh policy carries no credential value', () => {
    const policies = CONNECTORS.map((c) => refreshPolicyFor(c, () => 'ghp_secretvalue00000000'))
    assert.doesNotMatch(JSON.stringify(policies), /ghp_secretvalue/)
  })

  test('the http cache stores bodies and validators, never request credentials', async () => {
    const cache = createHttpCache()
    const { doFetch } = stubFetch([{ status: 200, headers: { etag: '"a"' }, body: { ok: true } }])
    const client = createHttpClient({ fetch: doFetch, cache })
    await client.json('https://api.test/x', { headers: { authorization: 'Bearer ghp_secret000000' } })
    assert.doesNotMatch(JSON.stringify(cache.entries()), /ghp_secret|authorization/i)
  })
})
