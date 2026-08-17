import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { playwright } from '../src/core/extraction/providers/playwright.js'
import { builtin } from '../src/core/extraction/providers/builtin.js'
import { extractFrom, extractUrl } from '../src/core/extraction/pipeline.js'
// Importing the provider index is what populates the registry.
import { connectorFor, candidatesFor, providerById } from '../src/core/extraction/providers/index.js'
import { serveFixtures } from '../benchmarks/serve.mjs'
import { loadCorpus } from '../benchmarks/corpus.js'
import { scoreCase } from '../benchmarks/score.js'

/**
 * Chromium is a 150 MB download that lives outside the repository, so a fresh checkout has
 * this file but not the browser. These tests skip themselves rather than fail — a suite that
 * cannot pass on a clean machine is a suite people learn to ignore.
 *
 * Nothing here touches the internet. The corpus is served from 127.0.0.1 for the duration of
 * the run, which is the only way to measure real navigation without leaving the machine.
 */
const health = await playwright.health()
const skip = health.state !== 'ok' ? `${health.detail} — skipping` : false

describe('extraction routing', () => {
  test('a URL a connector owns is not sent to an extraction provider', () => {
    // The rule the whole registry exists to state: extraction is the fallback branch. Thirty
    // connectors already know what to ask GitHub for, and a browser is a worse way to get it.
    assert.equal(connectorFor('https://github.com/torvalds'), 'github')
    assert.equal(connectorFor('https://orcid.org/0000-0002-1825-0097'), 'orcid')
    assert.equal(connectorFor('https://some-persons-site.example/about'), undefined)
  })

  test('providers with no detect claim everything, cheapest first', () => {
    const candidates = candidatesFor('https://some-persons-site.example/')
    assert.ok(candidates.length >= 2)
    assert.equal(candidates[0].id, 'builtin', 'the free one is asked before the browser')
  })

  test('providers are addressable by id', () => {
    assert.equal(providerById('playwright')?.id, 'playwright')
  })
})

describe('the Playwright provider', () => {
  test('declares what it can do', () => {
    assert.equal(playwright.capabilities.javascriptRendering, true)
    assert.equal(playwright.capabilities.dynamicContent, true)
    assert.equal(playwright.capabilities.screenshots, true)
    // The load-bearing one. If this were true, a score difference between the two providers
    // could come from the renderer or from a second parser, and the experiment would answer
    // neither question.
    assert.equal(playwright.capabilities.structuredExtraction, false)
  })

  test('shares one extractor with the built-in provider', async () => {
    const html = '<html><head><title>T</title></head><body><h1>A B</h1></body></html>'
    assert.deepEqual(
      await playwright.extract({ html }),
      await builtin.extract({ html }),
      'rendering must change the input, never the reading of it',
    )
  })
})

describe('rendering the corpus', { skip }, () => {
  let server
  let corpus

  before(async () => {
    server = await serveFixtures()
    corpus = await loadCorpus()
    await playwright.setup()
  })

  after(async () => {
    await playwright.teardown()
    await server?.close()
  })

  const caseNamed = (slug) => corpus.find((c) => c.slug === slug)
  const urlFor = (testCase) => `${server.origin}/${testCase.platform}/${testCase.slug}.html`

  test('recovers a profile that only exists after hydration', async () => {
    const testCase = caseNamed('hydrated-profile')
    const result = await extractFrom(playwright, urlFor(testCase), {
      url: testCase.expected.url,
      waitFor: testCase.expected.waitFor,
    })

    assert.equal(result.profile.identity.name, 'Soraya Haddad')
    assert.equal(result.profile.experience.length, 2)

    // The same page, unrendered, has no name in it at all. That contrast is the milestone.
    const stat = await extractFrom(builtin, urlFor(testCase), { url: testCase.expected.url })
    assert.ok(!stat.profile.identity.name)
  })

  test('reads JSON-LD that the client wrote', async () => {
    const testCase = caseNamed('injected-jsonld')
    const { profile } = await extractFrom(playwright, urlFor(testCase), {
      url: testCase.expected.url,
      waitFor: testCase.expected.waitFor,
    })

    assert.equal(profile.identity.name, 'Elif Yıldırım')
    assert.equal(profile.identity.location, 'İzmir, Türkiye')
  })

  test('a rendered DOM does not become a licence to invent', async () => {
    // Rendering returns *more* information, so it is also more opportunity to conclude
    // something false. This page grows an integrations widget and a "people also viewed"
    // rail that a static fetch never sees.
    const testCase = caseNamed('rendered-trap')
    const extraction = await extractFrom(playwright, urlFor(testCase), {
      url: testCase.expected.url,
      waitFor: testCase.expected.waitFor,
    })

    const score = scoreCase(testCase, extraction)
    assert.deepEqual(score.traps.filter((t) => t.violated), [])
    assert.equal(extraction.profile.experience.length, 1)
  })

  test('a selector that never appears is reported, not waited out', async () => {
    const testCase = caseNamed('hydrated-profile')
    const result = await playwright.fetch(urlFor(testCase), {
      waitFor: { selector: '#never-going-to-exist', timeoutMs: 800 },
    })

    assert.ok(result.failure, 'a page that rendered something else is a result, not a hang')
    assert.equal(result.html, '')
  })

  test('an unreachable URL fails without taking the run with it', async () => {
    const result = await playwright.fetch(`${server.origin}/does/not/exist.html`, {})
    // A 404 still renders a document, so this is not a failure — but it must not throw, and
    // it must not produce a person.
    assert.ok(result.status === 404 || result.failure)
  })

  test('timings are recorded for every page', async () => {
    const testCase = caseNamed('deferred-projects')
    const result = await extractFrom(playwright, urlFor(testCase), {
      url: testCase.expected.url,
      waitFor: testCase.expected.waitFor,
    })

    for (const key of ['navigationMs', 'renderMs', 'totalMs']) {
      assert.equal(typeof result.timings[key], 'number', `${key} was not measured`)
    }
    assert.ok(result.timings.totalMs > 0)
  })

  test('escalation renders the shell and leaves the static page alone', async () => {
    const shell = caseNamed('hydrated-profile')
    const stat = caseNamed('semantic-only')

    const escalated = await extractUrl(urlFor(shell), {
      providers: [builtin, playwright],
      url: shell.expected.url,
      waitFor: shell.expected.waitFor,
    })
    const cheap = await extractUrl(urlFor(stat), {
      providers: [builtin, playwright],
      url: stat.expected.url,
    })

    assert.deepEqual(escalated.attempts.map((a) => a.provider), ['builtin', 'playwright'])
    assert.equal(escalated.profile.identity.name, 'Soraya Haddad')

    // The whole economic argument: an ordinary page must not pay for a browser it did not
    // need. If this ever escalates, escalation has stopped being a saving.
    assert.deepEqual(cheap.attempts.map((a) => a.provider), ['builtin'])
    assert.equal(cheap.attempts[0].sufficient, true)
  })

  test('escalation never returns less than the cheap attempt', async () => {
    // A render that times out or hits a wall can recover less than the static fetch did.
    // Escalating into a worse answer would be a strange way to spend 400ms.
    const testCase = caseNamed('semantic-only')
    const broken = {
      ...playwright,
      id: 'broken',
      fetch: async () => ({ html: '', url: testCase.expected.url, failure: 'rendering fell over' }),
    }

    const result = await extractUrl(urlFor(testCase), {
      providers: [builtin, broken],
      url: testCase.expected.url,
    })

    assert.equal(result.profile.identity.name, 'Priya Raghunathan')
    assert.ok(result.profile.experience.length >= 3)
  })

  test('a URL a connector owns is refused, browser or not', async () => {
    const result = await extractUrl('https://github.com/torvalds', { providers: [builtin, playwright] })
    assert.equal(result.connector, 'github')
    assert.deepEqual(result.attempts, [], 'nothing was fetched at all')
  })

  test('rendered values are stamped as rendered', async () => {
    const testCase = caseNamed('injected-jsonld')
    const { evidence } = await extractFrom(playwright, urlFor(testCase), {
      url: testCase.expected.url,
      waitFor: testCase.expected.waitFor,
    })

    const how = evidence['identity|name'].extraction
    assert.equal(how.provider, 'playwright')
    assert.equal(how.rendered, true)
    assert.equal(how.method, 'JSON-LD', 'and which signal on the page it came from')
  })

  test('the browser is reused rather than relaunched per page', async () => {
    const before = playwright.session
    const testCase = caseNamed('deferred-projects')
    await playwright.fetch(urlFor(testCase), { waitFor: testCase.expected.waitFor })
    assert.equal(playwright.session, before, 'one browser, many contexts')
  })
})
