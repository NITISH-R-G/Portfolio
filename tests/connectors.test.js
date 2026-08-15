import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { CONNECTORS, getConnector, resolveDataSources, checkSource, connectorGroups } from '../src/connectors/index.js'
import { runConnectors, countRecords } from '../src/connectors/run.js'
import { createHttpClient, HttpError, explainStatus, retryAfterMs } from '../src/connectors/http.js'
import { parseFeed, excerpt } from '../src/connectors/feed.js'
import { handle, count, isoDay, formatNumber, list } from '../src/connectors/support.js'
import { normalizeProfile } from '../src/core/schema/profile.js'

/* -------------------------------------------------------------------------- */
/* Test helpers                                                                */
/* -------------------------------------------------------------------------- */

const NOW = Date.parse('2026-08-14T00:00:00Z')

/** A `fetch` that answers from a table of URL substrings. */
function stubFetch(routes) {
  return async (url) => {
    for (const [pattern, responder] of Object.entries(routes)) {
      if (!url.includes(pattern)) continue
      const value = typeof responder === 'function' ? responder(url) : responder
      if (value instanceof Response) return value
      return new Response(JSON.stringify(value), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
}

const text = (body, status = 200) => new Response(body, { status })

/** Run one source through the real runner. */
function runOne(dataSources, fetchImpl, env = () => undefined) {
  return runConnectors({ dataSources, fetch: fetchImpl, env, now: NOW, log: () => {} })
}

/* -------------------------------------------------------------------------- */

describe('connector registry', () => {
  test('every connector satisfies the contract', () => {
    for (const connector of CONNECTORS) {
      const where = `connector "${connector.id}"`
      assert.ok(connector.id, `${where} has an id`)
      assert.ok(connector.name, `${where} has a name`)
      assert.ok(connector.summary, `${where} has a summary`)
      assert.ok(Array.isArray(connector.fields), `${where} declares fields`)
      assert.equal(typeof connector.normalize, 'function', `${where} can normalize`)
      assert.ok(
        ['api', 'feed', 'token', 'manual', 'url-only'].includes(connector.availability),
        `${where} declares a known availability`,
      )
    }
  })

  test('ids are unique', () => {
    const ids = CONNECTORS.map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('a connector that cannot fetch has no fetch, and vice versa', () => {
    // This is the honesty invariant: `manual` and `url-only` exist precisely because those
    // platforms have no usable public interface. A fetch method on one would be a lie.
    for (const connector of CONNECTORS) {
      const cannotFetch = connector.availability === 'manual' || connector.availability === 'url-only'
      assert.equal(
        typeof connector.fetch === 'function', !cannotFetch,
        `"${connector.id}" declares ${connector.availability} but ${cannotFetch ? 'has' : 'lacks'} a fetch method`,
      )
    }
  })

  test('every connector that cannot fetch explains why', () => {
    for (const connector of CONNECTORS) {
      if (connector.availability === 'api' || connector.availability === 'feed') continue
      assert.ok(
        connector.limits && connector.limits.length > 20,
        `"${connector.id}" must document its limits so a user is not left guessing`,
      )
    }
  })

  test('connectors reading a credential name the environment variables', () => {
    for (const connector of CONNECTORS) {
      if (connector.availability !== 'token') continue
      assert.ok(connector.authEnv?.length, `"${connector.id}" must name the variables it reads`)
    }
  })

  test('resolves keys exactly, then by longest prefix', () => {
    assert.equal(getConnector('github')?.id, 'github')
    // Generic connectors are configurable more than once by suffixing the key.
    assert.equal(getConnector('custom2')?.id, 'custom')
    assert.equal(getConnector('customBehance')?.id, 'custom')
    assert.equal(getConnector('website2')?.id, 'website')
    assert.equal(getConnector('githib'), undefined, 'a typo must not silently resolve')
  })

  test('unknown data sources are reported rather than ignored', () => {
    const { sources, unknown } = resolveDataSources({
      github: { username: 'a' },
      githib: { username: 'b' },
    })
    assert.equal(sources.length, 1)
    assert.deepEqual(unknown, ['githib'])
  })

  test('a source missing its required field is skipped with a reason', () => {
    const github = getConnector('github')
    const result = checkSource(github, {})
    assert.equal(result.ok, false)
    assert.match(result.reason, /username/)
  })

  test('an explicitly disabled source is skipped', () => {
    const result = checkSource(getConnector('github'), { username: 'a', enabled: false })
    assert.equal(result.ok, false)
    assert.match(result.reason, /[Dd]isabled/)
  })

  test('every connector belongs to a displayed group', () => {
    const grouped = connectorGroups().flatMap((g) => g.connectors.length)
    assert.equal(grouped.reduce((a, b) => a + b, 0), CONNECTORS.length)
  })
})

describe('connector configuration parsing', () => {
  test('a pasted profile URL is accepted wherever a handle is', () => {
    // Pasting the URL is the most common thing a user does, and rejecting it would send
    // them to the docs to learn a distinction that does not matter to them.
    assert.equal(getConnector('github').identify({ username: 'https://github.com/octocat' }), 'octocat')
    assert.equal(getConnector('leetcode').identify({ username: 'https://leetcode.com/u/ada/' }), 'ada')
    assert.equal(getConnector('medium').identify({ username: '@writer' }), 'writer')
    assert.equal(getConnector('orcid').identify({ id: 'https://orcid.org/0000-0002-1825-0097' }), '0000-0002-1825-0097')
    assert.equal(getConnector('stackoverflow').identify({ userId: 'https://stackoverflow.com/users/22656/jon' }), '22656')
  })

  test('an unconfigured source identifies as nothing', () => {
    assert.equal(getConnector('github').identify({}), undefined)
    assert.equal(getConnector('github').identify({ username: '   ' }), undefined)
  })

  test('support helpers coerce the shapes real APIs return', () => {
    assert.equal(count('1,250'), 1250)
    assert.equal(count(null), undefined)
    assert.equal(count('N/A'), undefined)
    assert.equal(count(-5), undefined, 'a negative count is not meaningful')
    assert.equal(isoDay('2024-03-15T10:30:00Z'), '2024-03-15')
    assert.equal(isoDay(1710460800), '2024-03-15', 'Unix seconds are accepted')
    assert.equal(formatNumber(1250), '1.3k')
    assert.equal(formatNumber(2_400_000), '2.4M')
    assert.equal(formatNumber(999), '999')
    assert.deepEqual(list('a, b , c'), ['a', 'b', 'c'])
    assert.deepEqual(list(['a', ' b ']), ['a', 'b'])
    assert.equal(handle({ username: '@ada' }, ['username']), 'ada')
  })
})

/* -------------------------------------------------------------------------- */

describe('http client', () => {
  test('retries a 500 and then succeeds', async () => {
    let calls = 0
    const http = createHttpClient({
      sleep: async () => {},
      fetch: async () => {
        calls += 1
        return calls < 3 ? text('boom', 500) : new Response('{"ok":true}', { status: 200 })
      },
    })
    assert.deepEqual(await http.json('https://example.com/x'), { ok: true })
    assert.equal(calls, 3)
  })

  test('does not retry a 404, because the username is simply wrong', async () => {
    let calls = 0
    const http = createHttpClient({
      sleep: async () => {},
      fetch: async () => { calls += 1; return text('nope', 404) },
    })
    await assert.rejects(() => http.json('https://example.com/x'), HttpError)
    assert.equal(calls, 1)
  })

  test('jsonOrNull treats a 404 as absence rather than failure', async () => {
    const http = createHttpClient({ fetch: async () => text('nope', 404) })
    assert.equal(await http.jsonOrNull('https://example.com/x'), null)
  })

  test('gives up rather than waiting out a long rate-limit reset', async () => {
    // Waiting minutes inside a build is worse than failing this one source and letting the
    // rest of the import finish.
    let slept = 0
    const http = createHttpClient({
      sleep: async (ms) => { slept += ms },
      fetch: async () => new Response('slow down', {
        status: 429, headers: { 'retry-after': '600' },
      }),
    })
    await assert.rejects(() => http.json('https://example.com/x'), /rate limit/i)
    assert.equal(slept, 0)
  })

  test('a timeout is reported in words a user can act on', async () => {
    const http = createHttpClient({
      timeoutMs: 5,
      retries: 0,
      fetch: (url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      }),
    })
    await assert.rejects(() => http.json('https://example.com/x', { platform: 'Example' }), /did not respond/)
  })

  test('status codes explain themselves without jargon', () => {
    assert.match(explainStatus(404, 'GitHub'), /no such account/i)
    assert.match(explainStatus(403, 'GitHub'), /rate limit|private/i)
    assert.match(explainStatus(503, 'GitHub'), /not a problem with your configuration/i)
  })

  test('reads a rate-limit reset from either header style', () => {
    assert.equal(retryAfterMs(new Headers({ 'retry-after': '5' })), 5000)
    const now = 1_700_000_000_000
    const reset = String(Math.floor(now / 1000) + 10)
    assert.equal(
      retryAfterMs(new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }), now),
      10_000,
    )
  })
})

/* -------------------------------------------------------------------------- */

describe('feed parsing', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
    <title>My Blog</title><link>https://example.com</link>
    <item>
      <title><![CDATA[Why & how]]></title>
      <link>https://example.com/why-and-how</link>
      <pubDate>Tue, 14 Jan 2025 09:00:00 GMT</pubDate>
      <description>&lt;p&gt;A post about &amp;amp; things.&lt;/p&gt;</description>
      <category>engineering</category><category>writing</category>
    </item>
    <item><title>Second</title><link>https://example.com/2</link></item>
  </channel></rss>`

  test('reads RSS, resolving CDATA, entities and dates', () => {
    const feed = parseFeed(rss)
    assert.equal(feed.title, 'My Blog')
    assert.equal(feed.items.length, 2)
    assert.equal(feed.items[0].title, 'Why & how')
    assert.equal(feed.items[0].url, 'https://example.com/why-and-how')
    assert.equal(feed.items[0].date, '2025-01-14')
    assert.deepEqual(feed.items[0].tags, ['engineering', 'writing'])
    assert.match(feed.items[0].excerpt, /A post about & things/)
  })

  test('reads Atom, where the link is an attribute', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Channel</title>
      <entry>
        <title>Entry one</title>
        <link href="https://example.com/one"/>
        <published>2025-02-03T00:00:00Z</published>
        <category term="rust"/>
      </entry>
    </feed>`
    const feed = parseFeed(atom)
    assert.equal(feed.items[0].title, 'Entry one')
    assert.equal(feed.items[0].url, 'https://example.com/one')
    assert.equal(feed.items[0].date, '2025-02-03')
    assert.deepEqual(feed.items[0].tags, ['rust'])
  })

  test('an HTML error page yields no items instead of throwing', () => {
    // A feed URL that 200s with an HTML "not found" page is common, and must degrade to
    // "this source is empty" rather than crashing the import.
    assert.deepEqual(parseFeed('<html><body>Not found</body></html>').items, [])
    assert.deepEqual(parseFeed('').items, [])
    assert.deepEqual(parseFeed(null).items, [])
  })

  test('a javascript: link is dropped rather than rendered', () => {
    const hostile = `<rss><channel><item>
      <title>Click me</title><link>javascript:alert(1)</link>
    </item></channel></rss>`
    assert.equal(parseFeed(hostile).items[0].url, undefined)
  })

  test('excerpts strip markup and truncate on a word boundary', () => {
    assert.equal(excerpt('<p>Hello <b>there</b></p>'), 'Hello there')
    const long = excerpt('word '.repeat(100), 40)
    assert.ok(long.length <= 41, 'stays within the limit')
    assert.ok(long.endsWith('…'))
  })
})

/* -------------------------------------------------------------------------- */

describe('github connector', () => {
  const routes = {
    'api.github.com/users/octocat/repos': [
      {
        name: 'cool-thing', full_name: 'octocat/cool-thing', html_url: 'https://github.com/octocat/cool-thing',
        description: 'A thing', language: 'Python', topics: ['machine-learning', 'cli'],
        stargazers_count: 42, forks_count: 7, created_at: '2023-01-02T00:00:00Z',
        pushed_at: '2025-06-01T00:00:00Z', homepage: 'https://cool.example.com',
      },
      { name: 'a-fork', full_name: 'octocat/a-fork', html_url: 'https://github.com/octocat/a-fork', fork: true, stargazers_count: 3 },
      { name: 'octocat', full_name: 'octocat/octocat', html_url: 'https://github.com/octocat/octocat', stargazers_count: 9 },
      { name: 'secret', full_name: 'octocat/secret', html_url: 'https://github.com/octocat/secret', private: true },
    ],
    '/languages': { Python: 90_000, Shell: 10_000 },
    '/orgs': [],
    'api.github.com/users/octocat': {
      name: 'The Octocat', bio: 'I like code', location: 'SF',
      followers: 120, avatar_url: 'https://example.com/a.png', blog: 'octo.example.com',
    },
  }

  test('imports repositories, skipping forks, private repos and the profile README', async () => {
    const { sources, status } = await runOne({ github: { username: 'octocat' } }, stubFetch(routes))
    const profile = sources[0].profile

    const names = profile.projects.map((p) => p.name)
    assert.deepEqual(names, ['Cool Thing'], 'only the real, public, non-fork repository')
    assert.equal(status.github.state, 'partial', 'no token, so the extras were skipped')

    const project = profile.projects[0]
    assert.equal(project.stars, 42)
    assert.equal(project.liveUrl, 'https://cool.example.com/')
    assert.equal(project.source.connector, 'github')
    assert.ok(project.source.fetchedAt, 'a fetched record carries a timestamp')
  })

  test('derives byte-weighted language skills with evidence', async () => {
    const { sources } = await runOne({ github: { username: 'octocat' } }, stubFetch(routes))
    const python = sources[0].profile.skills.find((s) => s.name === 'Python')

    assert.ok(python, 'Python was derived from the language breakdown')
    assert.equal(python.evidence[0].label, '1 repository')
    assert.ok(python.weight > sources[0].profile.skills.find((s) => s.name === 'Shell').weight,
      'the language with more bytes weighs more')
  })

  test('a repository the user excluded does not appear', async () => {
    const { sources } = await runOne(
      { github: { username: 'octocat', exclude: ['cool-thing'] } },
      stubFetch(routes),
    )
    assert.deepEqual(sources[0].profile.projects, [])
  })

  test('a pinned repository outranks anything the scorer computes', async () => {
    const withToken = {
      ...routes,
      'graphql': {
        data: {
          user: {
            contributionsCollection: { contributionCalendar: { totalContributions: 1_234 } },
            pinnedItems: { nodes: [{ nameWithOwner: 'octocat/cool-thing' }] },
          },
        },
      },
    }
    const { sources, status } = await runOne(
      { github: { username: 'octocat' } },
      stubFetch(withToken),
      (name) => (name === 'GITHUB_TOKEN' ? 'ghp_test' : undefined),
    )
    assert.equal(sources[0].profile.projects[0].featured, true)
    assert.equal(status.github.state, 'imported', 'with a token there is nothing to warn about')

    const contributions = sources[0].profile.stats.entries.find((e) => e.id === 'contributions')
    assert.equal(contributions.value, 1_234)
    assert.equal(contributions.kind, 'fetched')
  })

  test('a missing account fails only that source, with an actionable message', async () => {
    const { sources, status } = await runOne(
      { github: { username: 'ghost' }, codeforces: { handle: 'tourist' } },
      stubFetch({
        'codeforces.com/api/user.info': { status: 'OK', result: [{ rating: 3000, maxRating: 3800, rank: 'legendary grandmaster' }] },
        'codeforces.com/api/user.rating': { status: 'OK', result: [] },
        'codeforces.com/api/user.status': { status: 'OK', result: [] },
      }),
    )
    assert.equal(status.github.state, 'error')
    assert.match(status.github.message, /no such account/i)
    assert.equal(status.codeforces.state, 'imported', 'the other source is unaffected')
    assert.equal(sources.length, 1)
  })
})

describe('codeforces connector', () => {
  test('counts each solved problem once, ignoring failed and duplicate submissions', async () => {
    const { sources } = await runOne({ codeforces: { handle: 'tourist' } }, stubFetch({
      'user.info': { status: 'OK', result: [{ rating: 3500, maxRating: 3800, rank: 'legendary grandmaster', maxRank: 'legendary grandmaster' }] },
      'user.rating': { status: 'OK', result: [{}, {}, {}] },
      'user.status': {
        status: 'OK',
        result: [
          { verdict: 'OK', problem: { contestId: 1, index: 'A' } },
          { verdict: 'OK', problem: { contestId: 1, index: 'A' } },
          { verdict: 'WRONG_ANSWER', problem: { contestId: 2, index: 'B' } },
          { verdict: 'OK', problem: { contestId: 2, index: 'B' } },
        ],
      },
    }))

    const entry = sources[0].profile.competitive[0]
    assert.equal(entry.problemsSolved, 2)
    assert.equal(entry.contests, 3)
    assert.equal(entry.rank, 'Legendary Grandmaster', 'the API lower-cases ranks')
  })

  test('a 200 response carrying a FAILED status is treated as an error', async () => {
    // Codeforces answers 200 with {status:"FAILED"} for a missing handle, so trusting the
    // HTTP status alone would import an empty profile and report success.
    const { status } = await runOne({ codeforces: { handle: 'nobody' } }, stubFetch({
      'user.info': { status: 'FAILED', comment: 'handles: User with handle nobody not found' },
    }))
    assert.equal(status.codeforces.state, 'error')
    assert.match(status.codeforces.message, /not found/)
  })
})

describe('manual connectors', () => {
  test('accepts typed figures and attributes them without claiming they were fetched', async () => {
    const { sources, status } = await runOne({
      hackerrank: { username: 'ada', rating: 2100, problemsSolved: 300, badges: ['SQL (Gold)'] },
    }, stubFetch({}))

    assert.equal(status.hackerrank.state, 'manual')
    const profile = sources[0].profile

    const entry = profile.competitive[0]
    assert.equal(entry.rating, 2100)
    assert.equal(entry.source.connector, 'hackerrank')
    assert.equal(entry.source.fetchedAt, undefined,
      'nothing was fetched, so there must be no fetch timestamp to imply otherwise')

    assert.equal(profile.achievements[0].title, 'SQL (Gold)')
    assert.equal(profile.socials.hackerrank, 'https://www.hackerrank.com/profile/ada')
  })

  test('a url-only connector contributes a link and nothing else', async () => {
    const { sources, status } = await runOne({ x: { username: 'ada' } }, stubFetch({}))
    assert.equal(status.x.state, 'link-only')
    assert.deepEqual(sources[0].profile.socials, { x: 'https://x.com/ada' })
    assert.equal(countRecords(sources[0].profile).projects, undefined)
  })

  test('two custom sources coexist instead of overwriting each other', async () => {
    const { sources } = await runOne({
      custom: { label: 'Behance', profileUrl: 'https://behance.net/ada' },
      custom2: { label: 'Dribbble', profileUrl: 'https://dribbble.com/ada' },
    }, stubFetch({}))

    const socials = Object.assign({}, ...sources.map((s) => s.profile.socials))
    assert.equal(socials.Behance, 'https://behance.net/ada')
    assert.equal(socials.Dribbble, 'https://dribbble.com/ada')
  })

  test('Google Scholar figures are marked stated, never reported', async () => {
    const { sources } = await runOne({
      googleScholar: { id: '0000000', citations: 500, hIndex: 12 },
    }, stubFetch({}))

    for (const entry of sources[0].profile.stats.entries) {
      assert.equal(entry.kind, 'stated',
        'Scholar publishes no API, so these can only be the owner\'s own claim')
    }
  })
})

describe('failure isolation', () => {
  test('a credential-less token connector reports unavailable, not error', async () => {
    const { status } = await runOne({ kaggle: { username: 'ada' } }, stubFetch({}))
    assert.equal(status.kaggle.state, 'unavailable')
    assert.match(status.kaggle.message, /KAGGLE_USERNAME/)
  })

  test('a failed fetch still keeps what the user typed', async () => {
    // An expired token should cost the live data, not the whole section.
    const { sources, status } = await runOne({
      kaggle: { username: 'ada', tier: 'Expert', competitionMedals: '2 gold' },
    }, stubFetch({}))

    assert.equal(status.kaggle.state, 'unavailable')
    assert.match(status.kaggle.message, /Kept .* from your configuration/)
    assert.equal(sources[0].profile.achievements.length, 2)
  })

  test('a connector whose normalize throws degrades to an error, not a crash', async () => {
    const broken = {
      id: 'broken', name: 'Broken', category: 'other', icon: 'Link', availability: 'api',
      homepage: '', summary: 'x', supportedData: [], fields: [],
      identify: () => 'x',
      fetch: async () => ({ ok: true }),
      normalize: () => { throw new Error('upstream changed shape') },
    }
    const { runOne: runSingle } = await import('../src/connectors/run.js')
    const result = await runSingle(
      { key: 'broken', connector: broken, config: { username: 'x' } },
      { http: createHttpClient({ fetch: async () => text('{}', 200) }), env: () => undefined, log: () => {}, now: NOW },
    )
    assert.equal(result.status.state, 'error')
    assert.match(result.status.message, /could not be interpreted/)
    assert.equal(result.profile, null)
  })

  test('all sources run even when several fail', async () => {
    const { status } = await runOne({
      github: { username: 'ghost' },
      npm: { username: 'ghost' },
      x: { username: 'ada' },
      hackerrank: { username: 'ada', rating: 100 },
    }, stubFetch({}))

    assert.equal(Object.keys(status).length, 4, 'every configured source produced a status')
    assert.equal(status.x.state, 'link-only')
    assert.equal(status.hackerrank.state, 'manual')
  })

  test('a source with nothing to show reports empty rather than success', async () => {
    const { status } = await runOne({ devto: { username: 'quiet' } }, stubFetch({
      'dev.to/api/articles': [],
    }))
    assert.equal(status.devto.state, 'empty')
  })
})

describe('connector output is schema-valid', () => {
  test('normalized output survives the schema normalizer unchanged in shape', async () => {
    const { sources } = await runOne({
      github: { username: 'octocat' },
    }, stubFetch({
      'api.github.com/users/octocat/repos': [{
        name: 'x', full_name: 'octocat/x', html_url: 'https://github.com/octocat/x',
        description: 'A repo', language: 'Go', stargazers_count: 5, created_at: '2024-01-01T00:00:00Z',
      }],
      '/languages': { Go: 1000 },
      '/orgs': [],
      'api.github.com/users/octocat': { name: 'Octo', followers: 3 },
    }))

    const normalized = normalizeProfile(sources[0].profile)
    assert.equal(normalized.projects.length, 1)
    assert.equal(normalized.projects[0].name, 'X')
    assert.equal(normalized.projects[0].stars, 5)
    assert.ok(normalized.projects[0].source.connector)
  })

  test('a hostile URL from an upstream API never reaches an href', async () => {
    const { sources } = await runOne({ github: { username: 'octocat' } }, stubFetch({
      'api.github.com/users/octocat/repos': [{
        name: 'x', full_name: 'octocat/x', html_url: 'https://github.com/octocat/x',
        homepage: 'javascript:alert(document.cookie)', stargazers_count: 1,
      }],
      '/languages': {},
      '/orgs': [],
      'api.github.com/users/octocat': {},
    }))

    const normalized = normalizeProfile(sources[0].profile)
    assert.equal(normalized.projects[0].liveUrl, undefined,
      'imported data is untrusted; only http(s) may become an href')
  })
})
