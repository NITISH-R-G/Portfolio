import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { detectSource, detectAll, recognisedPlatforms } from '../src/core/sources/detect.js'
import { resolveConnection, methodsFor, methodInfo, METHODS } from '../src/core/sources/methods.js'
import { getConnector, CONNECTORS } from '../src/connectors/index.js'
import { js, renderConfigFile } from '../scripts/lib/configFile.mjs'

/* -------------------------------------------------------------------------- */

describe('pasting a link', () => {
  test('every platform shape resolves to a working config', () => {
    // The whole point: a person should never have to know that GitHub wants a username,
    // Stack Overflow a number, ORCID a hyphenated code and dblp a person id.
    const cases = [
      ['https://github.com/octocat', 'github', 'octocat'],
      ['github.com/octocat', 'github', 'octocat'],
      ['https://www.linkedin.com/in/ada-lovelace/', 'linkedin', 'ada-lovelace'],
      ['https://leetcode.com/u/ada/', 'leetcode', 'ada'],
      ['https://codeforces.com/profile/tourist', 'codeforces', 'tourist'],
      ['https://stackoverflow.com/users/22656/jon-skeet', 'stackoverflow', '22656'],
      ['https://orcid.org/0000-0002-1825-0097', 'orcid', '0000-0002-1825-0097'],
      ['https://www.semanticscholar.org/author/A-Turing/1741101', 'semanticScholar', '1741101'],
      ['https://scholar.google.com/citations?user=abc123&hl=en', 'googleScholar', 'abc123'],
      ['https://medium.com/@ada', 'medium', 'ada'],
      ['https://ada.substack.com/', 'substack', 'ada'],
      ['https://dev.to/ada', 'devto', 'ada'],
      ['https://huggingface.co/ada', 'huggingface', 'ada'],
      ['https://www.kaggle.com/ada', 'kaggle', 'ada'],
      ['https://hub.docker.com/u/ada', 'dockerhub', 'ada'],
    ]

    for (const [url, connector, account] of cases) {
      const detection = detectSource(url)
      assert.equal(detection.outcome, 'matched', `${url} was not recognised`)
      assert.equal(detection.connector, connector, url)
      assert.equal(detection.account, account, url)
    }
  })

  test('a detected config actually satisfies its connector', () => {
    // A pattern that matches but produces an unusable config would connect a source that
    // then silently never imports.
    for (const { connector: id } of recognisedPlatforms()) {
      const connector = getConnector(id)
      const example = detectSource(exampleUrlFor(id))
      if (example.outcome !== 'matched') continue
      assert.ok(connector.identify?.(example.config), `${id} could not identify its own detected config`)
    }
  })

  test('a near miss explains itself instead of failing silently', () => {
    const repo = detectSource('https://github.com/octocat/hello-world')
    assert.equal(repo.outcome, 'near-miss')
    assert.match(repo.message, /repository/i)
    assert.match(repo.hint, /username/i)

    const video = detectSource('https://youtube.com/watch?v=abc')
    assert.equal(video.outcome, 'near-miss')
    assert.match(video.message, /channel id/i)
  })

  test('an unrecognised site becomes a personal website rather than an error', () => {
    const detection = detectSource('https://ada.dev/about')
    assert.equal(detection.outcome, 'website')
    assert.equal(detection.connector, 'website')
    assert.equal(detection.config.url, 'https://ada.dev')
  })

  test('a bare handle is refused rather than guessed at', () => {
    const detection = detectSource('adalovelace')
    assert.equal(detection.outcome, 'unknown')
    assert.match(detection.message, /any platform/i)
  })

  test('non-http links are refused', () => {
    for (const input of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com']) {
      assert.notEqual(detectSource(input).outcome, 'matched', input)
    }
  })

  test('several links at once merge rather than overwrite', () => {
    const { sources } = detectAll(`
      https://pypi.org/project/requests
      https://pypi.org/project/httpx
      https://github.com/ada
    `)
    assert.deepEqual(sources.pypi.packages, ['requests', 'httpx'])
    assert.equal(sources.github.username, 'ada')
  })
})

describe('connection methods', () => {
  test('a source resolves to the best rung it can actually reach', () => {
    const github = resolveConnection(getConnector('github'), { username: 'ada' })
    assert.equal(github.method, 'api')
    assert.equal(github.ready, true)

    const medium = resolveConnection(getConnector('medium'), { username: 'ada' })
    assert.equal(medium.method, 'endpoint', 'a feed is a public structured endpoint')

    const x = resolveConnection(getConnector('x'), { username: 'ada' })
    assert.equal(x.method, 'profile-url', 'no API, so the link is the honest outcome')
  })

  test('an unconfigured source says what it needs', () => {
    const result = resolveConnection(getConnector('github'), {})
    assert.equal(result.ready, false)
    assert.match(result.blocker, /github username/i)
  })

  test('a credential-gated source is unready until the credential exists', () => {
    const connector = getConnector('kaggle')
    const without = resolveConnection(connector, { username: 'ada' }, { env: () => undefined })
    assert.equal(without.ready, false)
    assert.match(without.blocker, /KAGGLE_USERNAME/)

    const with_ = resolveConnection(connector, { username: 'ada' }, { env: () => 'set' })
    assert.equal(with_.ready, true)
  })

  test('an optional token is mentioned without making the source unready', () => {
    // GitHub works without one; saying otherwise would send people hunting for a token
    // they do not need.
    const result = resolveConnection(getConnector('github'), { username: 'ada' }, { env: () => undefined })
    assert.equal(result.ready, true)
    assert.match(result.blocker, /raises its limits/i)
  })

  test('the ladder never offers a rung this project cannot climb', () => {
    for (const connector of CONNECTORS) {
      const config = Object.fromEntries(connector.fields.filter((f) => f.required).map((f) => [f.key, 'x']))
      const resolved = resolveConnection(connector, { ...config, profileUrl: 'https://example.com/x' })
      if (!resolved.ready) continue
      assert.equal(methodInfo(resolved.method)?.available, true,
        `${connector.id} resolved to an unavailable method (${resolved.method})`)
    }
  })

  test('extraction is on the ladder but declared unavailable', () => {
    // It is named so the model is complete and the UI can say "not yet" — and so adding a
    // backend later is registering an implementation, not a rewrite.
    const extraction = METHODS.find((m) => m.id === 'extraction')
    assert.equal(extraction.available, false)
    assert.ok(extraction.unavailableReason)
    assert.ok(methodsFor(getConnector('linkedin')).includes('extraction'))
  })

  test('every connector maps to at least one method', () => {
    for (const connector of CONNECTORS) {
      assert.ok(methodsFor(connector).length > 0, connector.id)
    }
  })
})

describe('writing the config back', () => {
  test('output is JavaScript a person would have written', () => {
    const rendered = js({ identity: { name: "Ada O'Hara" }, dataSources: { github: { username: 'ada' } } })
    assert.match(rendered, /identity: \{/, 'unquoted keys')
    assert.match(rendered, /'Ada O\\'Hara'/, 'single quotes, escaped')
    assert.match(rendered, /,\n/, 'trailing commas')
    assert.ok(!rendered.includes('"'), 'no JSON double quotes')
  })

  test('a written config is loadable', async () => {
    const source = renderConfigFile({ identity: { name: 'Ada' }, dataSources: { github: { username: 'ada' } } })
    assert.match(source, /^\/\/ @ts-check/)
    assert.match(source, /export default defineConfig\(\{/)

    // Executed to prove it parses, rather than trusting that it looks right.
    const module = await import(
      `data:text/javascript,${encodeURIComponent(source.replace("from './src/core/config/types.js'", "from 'data:text/javascript,export const defineConfig = (c) => c'"))}`
    )
    assert.equal(module.default.identity.name, 'Ada')
    assert.equal(module.default.dataSources.github.username, 'ada')
  })

  test('a long list wraps instead of running off the line', () => {
    const long = js({ sectionOrder: ['hero', 'about', 'stats', 'projects', 'experience', 'education', 'skills'] })
    assert.ok(long.includes('\n'), 'a long array is broken across lines')
  })

  test('empty values are dropped rather than written as blanks', () => {
    assert.equal(js({ a: 'x', b: '', c: undefined }), "{\n  a: 'x',\n}")
  })
})

/* -------------------------------------------------------------------------- */

/** A representative URL per connector, for the round-trip check. */
function exampleUrlFor(id) {
  return {
    github: 'https://github.com/ada',
    gitlab: 'https://gitlab.com/ada',
    bitbucket: 'https://bitbucket.org/ada',
    dockerhub: 'https://hub.docker.com/u/ada',
    npm: 'https://npmjs.com/~ada',
    pypi: 'https://pypi.org/user/ada',
    huggingface: 'https://huggingface.co/ada',
    kaggle: 'https://kaggle.com/ada',
    leetcode: 'https://leetcode.com/u/ada',
    codeforces: 'https://codeforces.com/profile/ada',
    codechef: 'https://codechef.com/users/ada',
    hackerrank: 'https://hackerrank.com/profile/ada',
    hackerearth: 'https://hackerearth.com/@ada',
    stackoverflow: 'https://stackoverflow.com/users/22656',
    orcid: 'https://orcid.org/0000-0002-1825-0097',
    semanticScholar: 'https://semanticscholar.org/author/1741101',
    dblp: 'https://dblp.org/pid/l/BarbaraLiskov.html',
    googleScholar: 'https://scholar.google.com/citations?user=abc',
    researchgate: 'https://researchgate.net/profile/Ada',
    medium: 'https://medium.com/@ada',
    substack: 'https://ada.substack.com',
    hashnode: 'https://hashnode.com/@ada',
    devto: 'https://dev.to/ada',
    youtube: 'https://youtube.com/channel/UC12345',
    devpost: 'https://devpost.com/ada',
    linkedin: 'https://linkedin.com/in/ada',
    x: 'https://x.com/ada',
  }[id] ?? 'https://example.com'
}
