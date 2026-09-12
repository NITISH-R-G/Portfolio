import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CONNECTORS, getConnector, connectorGroups } from '../src/connectors/index.js'
import { detectSource, recognisedPlatforms } from '../src/core/sources/detect.js'
import { normalizeProfile } from '../src/core/schema/profile.js'
import { capabilitiesFor } from '../src/core/sources/capabilities.js'
import { refreshPolicyFor } from '../src/core/sources/refresh.js'
import { actionFor } from '../src/admin/panels/source-catalogue.js'

/**
 * The connectors added in Phase 7.
 *
 * The rule every assertion here defends: **a connector may only claim what it can actually
 * do.** A registry entry is a promise the Admin repeats verbatim — the action offered, the data
 * listed, whether it refreshes — so a connector that overstates itself does not merely fail
 * quietly, it lies to the person deciding whether to connect it.
 *
 * Fixtures are shaped like the providers' real responses, captured from live calls on
 * 2026-09-08, because a trivial fixture proves only that the code runs.
 */

/** The twelve added in this phase. */
const ADDED = [
  'codeberg', 'sourcehut', 'cratesio', 'atcoder',
  'openalex', 'crossref', 'arxiv',
  'bluesky', 'mastodon',
  'codepen', 'behance', 'dribbble',
]

const ctx = { now: Date.parse('2026-09-08T00:00:00Z') }

/* -------------------------------------------------------------------------- */
/* Registry and catalogue exposure                                            */
/* -------------------------------------------------------------------------- */

describe('the new connectors are part of the registry, not a second list', () => {
  test('every one is registered exactly once', () => {
    const ids = CONNECTORS.map((c) => c.id)
    for (const id of ADDED) {
      assert.equal(ids.filter((other) => other === id).length, 1, `${id} is not registered exactly once`)
    }
    assert.equal(ids.length, new Set(ids).size, 'the registry contains a duplicate')
  })

  test('the catalogue and the search browser pick them up with no hardcoding', () => {
    // The Phase 4 browser derives everything from `allCapabilities()`, so a connector that is
    // in the registry is automatically in Connect, in search and in a category.
    for (const id of ADDED) {
      assert.ok(capabilitiesFor(id), `${id} produces no capabilities`)
    }
    const grouped = connectorGroups().flatMap((group) => group.connectors.map((c) => c.id))
    for (const id of ADDED) {
      assert.ok(grouped.includes(id), `${id} is in no category group`)
    }
  })

  test('the new Design category exists because three real connectors are in it', () => {
    const design = connectorGroups().find((group) => group.category === 'design')
    assert.ok(design, 'the design category is missing')
    assert.deepEqual(design.connectors.map((c) => c.id).sort(), ['behance', 'codepen', 'dribbble'])
  })

  test('no category is empty', () => {
    for (const group of connectorGroups()) {
      assert.ok(group.connectors.length > 0, `${group.category} is empty`)
    }
  })

  test('every new connector declares the fields the contract requires', () => {
    for (const id of ADDED) {
      const c = getConnector(id)
      assert.ok(c.name && c.category && c.icon, id)
      assert.ok(c.availability, id)
      assert.ok(c.summary && c.summary.length > 10, id)
      assert.ok(c.limits && c.limits.length > 20, `${id} must say what it cannot do`)
      assert.ok(Array.isArray(c.supportedData) && c.supportedData.length, id)
      assert.ok(Array.isArray(c.fields), id)
      assert.equal(typeof c.identify, 'function', id)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* URL detection                                                              */
/* -------------------------------------------------------------------------- */

describe('URL detection', () => {
  const valid = [
    ['https://codeberg.org/Codeberg', 'codeberg', { username: 'Codeberg' }],
    ['https://git.sr.ht/~sircmpwn', 'sourcehut', { username: 'sircmpwn' }],
    ['https://sr.ht/~alice', 'sourcehut', { username: 'alice' }],
    ['https://crates.io/users/dtolnay', 'cratesio', { username: 'dtolnay' }],
    ['https://atcoder.jp/users/tourist', 'atcoder', { username: 'tourist' }],
    ['https://arxiv.org/a/lovelace_a', 'arxiv', { author: 'lovelace_a' }],
    ['https://bsky.app/profile/bsky.app', 'bluesky', { handle: 'bsky.app' }],
    ['https://codepen.io/chriscoyier', 'codepen', { username: 'chriscoyier' }],
    ['https://www.behance.net/adobe', 'behance', { username: 'adobe' }],
    ['https://dribbble.com/dribbble', 'dribbble', { username: 'dribbble' }],
  ]

  for (const [url, connector, config] of valid) {
    test(`detects ${connector} from ${url}`, () => {
      const result = detectSource(url)
      assert.equal(result.outcome, 'matched', url)
      assert.equal(result.connector, connector)
      // The account identity must survive detection — a URL that resolves to the wrong handle
      // silently imports a stranger's data.
      for (const [key, value] of Object.entries(config)) {
        assert.equal(result.config[key], value, `${url} lost ${key}`)
      }
    })
  }

  test('detects OpenAlex from an ORCID-filtered URL, keeping the iD', () => {
    const result = detectSource('https://openalex.org/works?filter=author.orcid:0000-0002-1825-0097')
    assert.equal(result.outcome, 'matched')
    assert.equal(result.connector, 'openalex')
    assert.equal(result.config.orcid, '0000-0002-1825-0097')
  })

  test('an unrelated URL is not mistaken for any of them', () => {
    // The false positive that matters: a personal site or a docs page must not be claimed by a
    // connector merely because it is a URL.
    for (const url of ['https://example.com/about', 'https://news.ycombinator.com/user?id=x', 'https://my.blog/posts/1']) {
      const result = detectSource(url)
      assert.notEqual(result.outcome, 'matched', `${url} was wrongly matched to ${result.connector}`)
    }
  })

  test('a lookalike hostname is rejected', () => {
    for (const url of ['https://codeberg.org.evil.test/user', 'https://notcrates.io/users/x', 'https://bsky.app.fake.test/profile/x']) {
      const result = detectSource(url)
      assert.notEqual(result.connector, 'codeberg', url)
      assert.notEqual(result.connector, 'cratesio', url)
      assert.notEqual(result.connector, 'bluesky', url)
    }
  })

  test('nonsense is not a profile', () => {
    for (const input of ['not a url', '', 'ftp://x', 'javascript:alert(1)']) {
      assert.notEqual(detectSource(input).outcome, 'matched', JSON.stringify(input))
    }
  })

  test('every new URL-based connector is reachable from a pasted link', () => {
    const recognised = new Set(recognisedPlatforms().map((p) => p.connector))
    // Two deliberate exceptions, both identifier-based rather than URL-based:
    //
    //   Mastodon — the instance is part of the address, so there is no single hostname to
    //   recognise; `@you@fosstodon.org` is configured from the handle.
    //
    //   Crossref — matched by ORCID, and `orcid.org/…` already belongs to the ORCID connector.
    //   Claiming that hostname too would make one pasted link ambiguous between two sources.
    const identifierBased = new Set(['mastodon', 'crossref'])
    for (const id of ADDED.filter((x) => !identifierBased.has(x))) {
      assert.ok(recognised.has(id), `${id} cannot be added by pasting a URL`)
    }
  })

  test('an ORCID link still resolves to exactly one connector', () => {
    // The ambiguity the exception above avoids: three connectors here are keyed by ORCID, and
    // a pasted iD must not silently configure the wrong one.
    const result = detectSource('https://orcid.org/0000-0002-1825-0097')
    assert.equal(result.outcome, 'matched')
    assert.equal(result.connector, 'orcid')
  })
})

/* -------------------------------------------------------------------------- */
/* Capability honesty                                                         */
/* -------------------------------------------------------------------------- */

describe('each connector claims only what it can do', () => {
  test('the API connectors declare an API and can fetch', () => {
    for (const id of ['codeberg', 'cratesio', 'bluesky', 'mastodon', 'openalex', 'crossref', 'arxiv']) {
      const c = getConnector(id)
      assert.equal(c.availability, 'api', id)
      assert.equal(typeof c.fetch, 'function', `${id} claims an API but cannot fetch`)
      assert.equal(actionFor(capabilitiesFor(id), false).kind, 'connect', id)
      assert.equal(refreshPolicyFor(c).mode, 'automatic', id)
    }
  })

  test('the link-only connectors offer no connection and cannot fetch', () => {
    // The rule Phase 4 established: a platform with nothing readable must not render an action
    // implying data will arrive.
    for (const id of ['sourcehut', 'codepen', 'behance', 'dribbble']) {
      const c = getConnector(id)
      assert.equal(c.availability, 'url-only', id)
      assert.equal(c.fetch, undefined, `${id} must not pretend to fetch`)
      const action = actionFor(capabilitiesFor(id), false)
      assert.equal(action.kind, 'url', id)
      assert.notEqual(action.label, 'Connect', id)
      assert.equal(refreshPolicyFor(c).mode, 'unsupported', id)
      assert.deepEqual(c.supportedData, ['socials'], `${id} must claim only a link`)
    }
  })

  test('AtCoder is manual, and says why rather than using a third-party mirror', () => {
    const c = getConnector('atcoder')
    assert.equal(c.availability, 'manual')
    assert.equal(c.fetch, undefined)
    assert.equal(refreshPolicyFor(c).mode, 'manual')
    assert.match(c.limits, /no official API/i)
    assert.match(c.limits, /kenkoooo/, 'the limits should name the mirror it deliberately avoids')
  })

  test('none of the new connectors requires a credential', () => {
    // Every one was chosen because its public interface needs no key. A credential appearing
    // here would mean a provider was misclassified.
    for (const id of ADDED) {
      const c = getConnector(id)
      assert.equal(c.availability === 'token', false, id)
      assert.deepEqual(c.authEnv ?? [], [], `${id} unexpectedly wants a credential`)
    }
  })

  test('none claims webhook ingestion or a per-source schedule', () => {
    for (const id of ADDED) {
      const policy = refreshPolicyFor(getConnector(id))
      assert.equal(policy.webhook.ingestible, false, id)
      assert.equal(policy.cadence.perSource, false, id)
    }
  })

  test('conditional-request support is never declared, only discovered', () => {
    for (const id of ADDED) {
      const source = JSON.stringify(getConnector(id))
      assert.doesNotMatch(source, /supportsETag|supportsConditional|etag":\s*true/i, id)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Normalization, against provider-shaped payloads                            */
/* -------------------------------------------------------------------------- */

describe('normalization produces the schema, with provenance', () => {
  /** Shaped like a real Forgejo response — the fields captured from codeberg.org. */
  const CODEBERG = {
    profile: {
      login: 'ada', full_name: 'Ada Lovelace', description: 'Analytical engines.',
      location: 'London', avatar_url: 'https://codeberg.org/avatars/ada',
      html_url: 'https://codeberg.org/ada', email: 'ada@example.test',
    },
    repos: [
      { name: 'engine', full_name: 'ada/engine', description: 'A machine', html_url: 'https://codeberg.org/ada/engine', language: 'Rust', stars_count: 12, forks_count: 2, private: false, fork: false, updated_at: '2026-08-01T00:00:00Z', website: 'https://engine.test' },
      { name: 'notes', full_name: 'ada/notes', html_url: 'https://codeberg.org/ada/notes', language: 'Rust', stars_count: 3, private: false, fork: false, updated_at: '2026-07-01T00:00:00Z' },
      { name: 'aprivate', full_name: 'ada/aprivate', html_url: 'https://codeberg.org/ada/aprivate', private: true, fork: false },
      { name: 'aforked', full_name: 'ada/aforked', html_url: 'https://codeberg.org/ada/aforked', private: false, fork: true },
    ],
    host: 'https://codeberg.org',
  }

  test('Codeberg maps repositories, languages and identity', () => {
    const profile = getConnector('codeberg').normalize(CODEBERG, {}, ctx)
    assert.equal(profile.projects.length, 2, 'private and forked repositories must be excluded')
    assert.equal(profile.projects[0].name, 'engine')
    assert.equal(profile.projects[0].stars, 12)
    assert.equal(profile.projects[0].liveUrl, 'https://engine.test')
    assert.equal(profile.identity.name, 'Ada Lovelace')
    assert.equal(profile.socials.codeberg, 'https://codeberg.org/ada')
    // One skill per language, weighted by use.
    const rust = profile.skills.find((s) => s.name === 'Rust')
    assert.equal(rust.weight, 2)
  })

  test('Codeberg never imports the email a profile happens to publish', () => {
    // Not a privacy filter catching it afterwards — it is never collected. A user publishing an
    // address on one platform did not consent to it appearing on their portfolio.
    const profile = getConnector('codeberg').normalize(CODEBERG, {}, ctx)
    assert.equal(profile.identity.email, undefined)
    assert.doesNotMatch(JSON.stringify(profile), /ada@example\.test/)
  })

  test('forks are included when asked for', () => {
    const profile = getConnector('codeberg').normalize(CODEBERG, { includeForks: true }, ctx)
    assert.equal(profile.projects.length, 3)
  })

  test('crates.io maps packages, downloads and a Rust skill', () => {
    const raw = {
      user: { id: 1, login: 'ada' },
      crates: {
        crates: [
          { name: 'engine', description: 'A machine', max_stable_version: '1.2.0', downloads: 5000, repository: 'https://github.com/ada/engine', keywords: ['rust'], updated_at: '2026-08-01T00:00:00Z' },
          { name: 'notes', newest_version: '0.1.0', downloads: 12, updated_at: '2026-07-01T00:00:00Z' },
        ],
      },
    }
    const profile = getConnector('cratesio').normalize(raw, {}, ctx)
    assert.equal(profile.packages.length, 2)
    assert.equal(profile.packages[0].version, '1.2.0')
    assert.equal(profile.packages[0].registry, 'crates.io')
    assert.equal(profile.stats.entries[0].value, 5012)
    assert.equal(profile.stats.entries[0].kind, 'fetched')
    assert.deepEqual(profile.stats.entries[0].connectors, ['cratesio'])
    assert.equal(profile.skills[0].name, 'Rust')
  })

  test('OpenAlex maps works, citations and venue', () => {
    const raw = {
      meta: { count: 42 },
      results: [{
        id: 'https://openalex.org/W123', doi: 'https://doi.org/10.1/abc',
        display_name: 'On computing', publication_year: 2024, cited_by_count: 7, type: 'article',
        primary_location: { source: { display_name: 'Journal of Things' } },
        authorships: [{ author: { display_name: 'Ada Lovelace' } }],
      }],
    }
    const profile = getConnector('openalex').normalize(raw, { orcid: '0000-0002-1825-0097' }, ctx)
    assert.equal(profile.publications.length, 1)
    assert.equal(profile.publications[0].title, 'On computing')
    assert.equal(profile.publications[0].doi, '10.1/abc', 'the DOI prefix should be stripped')
    assert.equal(profile.publications[0].venue, 'Journal of Things')
    assert.equal(profile.stats.entries.find((e) => e.id === 'openalex-works').value, 42)
  })

  test('Crossref reads its nested date-parts and array titles', () => {
    const raw = {
      message: {
        items: [{
          title: ['A paper'], DOI: '10.1/xyz', publisher: 'A Press',
          'container-title': ['Proceedings'], type: 'proceedings-article',
          'published-print': { 'date-parts': [[2023, 5, 1]] },
          'is-referenced-by-count': 3,
          author: [{ given: 'Ada', family: 'Lovelace' }],
        }],
      },
    }
    const profile = getConnector('crossref').normalize(raw, { orcid: '0000-0002-1825-0097' }, ctx)
    assert.equal(profile.publications[0].year, 2023)
    assert.equal(profile.publications[0].publisher, 'A Press')
    assert.deepEqual(profile.publications[0].authors, ['Ada Lovelace'])
  })

  test('arXiv parses its Atom feed, including multi-line titles', () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      '<entry>',
      '  <id>http://arxiv.org/abs/2102.12627v1</id>',
      '  <title>How to represent\n  part-whole hierarchies</title>',
      '  <published>2021-02-25T01:51:22Z</published>',
      '  <summary>An abstract that\n  wraps.</summary>',
      '  <author><name>Geoffrey Hinton</name></author>',
      '</entry>',
      '</feed>',
    ].join('\n')
    const profile = getConnector('arxiv').normalize(xml, { author: 'Hinton' }, ctx)
    assert.equal(profile.publications.length, 1)
    assert.equal(profile.publications[0].title, 'How to represent part-whole hierarchies')
    assert.equal(profile.publications[0].year, 2021)
    assert.deepEqual(profile.publications[0].authors, ['Geoffrey Hinton'])
    assert.equal(profile.publications[0].type, 'preprint')
  })

  test('Bluesky and Mastodon map profile and counts, not timelines', () => {
    const bsky = getConnector('bluesky').normalize(
      { handle: 'ada.bsky.social', displayName: 'Ada', description: 'Hello', followersCount: 10, postsCount: 3 }, {}, ctx,
    )
    assert.equal(bsky.identity.name, 'Ada')
    assert.equal(bsky.stats.entries.length, 2)
    assert.equal(bsky.socials.bluesky, 'https://bsky.app/profile/ada.bsky.social')
    assert.equal(bsky.posts, undefined, 'a portfolio is not a timeline')

    const masto = getConnector('mastodon').normalize(
      { display_name: 'Ada', note: '<p>Hello <b>there</b></p>', followers_count: 5, url: 'https://m.test/@ada' },
      { handle: '@ada@m.test' }, ctx,
    )
    assert.equal(masto.identity.name, 'Ada')
    assert.match(masto.identity.summary, /Hello there/, 'HTML should be reduced to text')
    assert.doesNotMatch(masto.identity.summary, /<[a-z]/i, 'markup must not reach a text field')
  })

  test('every fetched record keeps its source', () => {
    const cases = [
      ['codeberg', CODEBERG, {}],
      ['cratesio', { user: { login: 'a' }, crates: { crates: [{ name: 'c', downloads: 1 }] } }, {}],
      ['openalex', { meta: { count: 1 }, results: [{ id: 'W1', display_name: 'T', publication_year: 2020 }] }, { orcid: '0000-0002-1825-0097' }],
    ]
    for (const [id, raw, cfg] of cases) {
      const profile = getConnector(id).normalize(raw, cfg, ctx)
      const records = [...(profile.projects ?? []), ...(profile.packages ?? []), ...(profile.publications ?? [])]
      assert.ok(records.length, id)
      for (const record of records) {
        assert.ok(record.source, `${id} produced a record with no provenance`)
        assert.equal(record.source.connector, id)
      }
    }
  })

  test('malformed provider responses produce nothing rather than nonsense', () => {
    // `normalize` must never throw — the runner treats a throw as a connector fault, and a
    // provider changing its shape is not a reason to lose the rest of the import.
    for (const id of ['codeberg', 'cratesio', 'openalex', 'crossref', 'arxiv', 'bluesky', 'mastodon']) {
      const c = getConnector(id)
      for (const raw of [null, undefined, {}, [], 'garbage', { results: 'no' }, { message: { items: 'no' } }]) {
        const profile = c.normalize(raw, {}, ctx)
        assert.equal(typeof profile, 'object', `${id} did not return an object for ${JSON.stringify(raw)}`)
        const normalized = normalizeProfile(profile)
        for (const key of ['projects', 'packages', 'publications']) {
          assert.equal((normalized[key] ?? []).length, 0, `${id} invented ${key} from ${JSON.stringify(raw)}`)
        }
      }
    }
  })

  test('a connector produces only the collections it declared', () => {
    const cases = [
      ['codeberg', CODEBERG, {}],
      ['bluesky', { handle: 'a.b', displayName: 'A', followersCount: 1 }, {}],
      ['arxiv', '<feed><entry><id>http://arxiv.org/abs/1</id><title>T</title><published>2020-01-01T00:00:00Z</published></entry></feed>', { author: 'x' }],
    ]
    for (const [id, raw, cfg] of cases) {
      const c = getConnector(id)
      const profile = c.normalize(raw, cfg, ctx)
      const declared = new Set([...c.supportedData, 'meta'])
      for (const [key, value] of Object.entries(profile)) {
        const produced = Array.isArray(value) ? value.length > 0 : value && Object.keys(value).length > 0
        if (!produced) continue
        assert.ok(declared.has(key), `${id} produced "${key}" without declaring it`)
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Failure and privacy                                                        */
/* -------------------------------------------------------------------------- */

describe('failure and privacy', () => {
  test('a fetch with no identifier fails with an actionable message', async () => {
    const ctxFetch = { http: { json: async () => ({}), text: async () => '' }, env: () => undefined, log: () => {}, now: Date.now() }
    for (const id of ['codeberg', 'cratesio', 'bluesky', 'mastodon', 'openalex', 'crossref', 'arxiv']) {
      await assert.rejects(
        () => getConnector(id).fetch({}, ctxFetch),
        (err) => {
          assert.ok(err.message.length > 15, `${id}: "${err.message}"`)
          return true
        },
        id,
      )
    }
  })

  test('the ORCID-matched connectors refuse a name, so they cannot claim a stranger’s papers', async () => {
    const ctxFetch = { http: { json: async () => ({}) }, env: () => undefined, log: () => {}, now: Date.now() }
    for (const id of ['openalex', 'crossref']) {
      await assert.rejects(() => getConnector(id).fetch({ orcid: 'Ada Lovelace' }, ctxFetch), /ORCID/i, id)
    }
  })

  test('no connector puts a credential anywhere in its output', () => {
    const secret = 'ghp_averysecrettokenvalue000000'
    for (const id of ADDED) {
      const c = getConnector(id)
      const profile = c.normalize({}, { token: secret, apiKey: secret, mailto: secret }, ctx)
      assert.doesNotMatch(JSON.stringify(profile), new RegExp(secret), `${id} leaked a credential`)
    }
  })

  test('the optional contact address is sent to the provider, never published', async () => {
    // OpenAlex and Crossref ask for one to use their faster pool. It belongs in a query string
    // to them and nowhere else — certainly not in the normalized profile.
    const seen = []
    const ctxFetch = { http: { json: async (url) => { seen.push(url); return {} } }, env: () => undefined, log: () => {}, now: Date.now() }
    for (const id of ['openalex', 'crossref']) {
      const cfg = { orcid: '0000-0002-1825-0097', mailto: 'ada@example.test' }
      await getConnector(id).fetch(cfg, ctxFetch)
      const profile = getConnector(id).normalize({}, cfg, ctx)
      assert.doesNotMatch(JSON.stringify(profile), /ada@example\.test/, `${id} published the contact address`)
    }
    assert.ok(seen.every((url) => url.includes('mailto=')), 'the address should reach the provider')
  })
})
