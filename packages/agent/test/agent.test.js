import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { PortfolioAgent, PortfolioError, validateManifest, discoverManifest } from '../src/index.js'
import { linkedManifest, candidates } from '../src/manifest.js'
import { fictional, leaky, minimal, future, pageHtml } from './fixtures.js'

const agent = () => PortfolioAgent.fromManifest(fictional, { url: fictional.url })

/** A fetch stub that serves a fixed routing table and records what was asked for. */
function stubFetch(routes) {
  const asked = []
  const fetch = async (url) => {
    asked.push(url)
    const route = routes[url]
    if (!route) return { ok: false, status: 404, headers: { get: () => '' }, text: async () => '' }
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? route.type : '') },
      text: async () => route.body,
    }
  }
  return { fetch, asked }
}

/* -------------------------------------------------------------------------- */

describe('loading', () => {
  test('reads a manifest and exposes the person', () => {
    const portfolio = agent()
    assert.equal(portfolio.person.name, 'Marina Delacroix')
    assert.equal(portfolio.person.headline, 'Marine Robotics Engineer')
  })

  test('rejects a future major schema version rather than guessing', () => {
    // Silently mis-reading a shape you do not understand produces confidently wrong answers
    // about a real person — worse than refusing.
    assert.throws(() => PortfolioAgent.fromManifest(future), PortfolioError)
    const { valid, issues } = validateManifest(future)
    assert.equal(valid, false)
    assert.match(issues.find((i) => i.level === 'error').message, /schema version 2\.0/)
  })

  test('accepts an unknown minor version, noting it', () => {
    const { valid, issues } = validateManifest({ ...minimal, schemaVersion: '1.7' })
    assert.equal(valid, true)
    assert.ok(issues.some((i) => i.level === 'info'))
  })

  test('accepts unknown fields without dropping the document', () => {
    const portfolio = PortfolioAgent.fromManifest({ ...fictional, somethingNew: { a: 1 } })
    assert.equal(portfolio.person.name, 'Marina Delacroix')
  })

  test('handles a minimal portfolio without throwing', () => {
    const portfolio = PortfolioAgent.fromManifest(minimal)
    assert.deepEqual(portfolio.getProjects(), [])
    assert.deepEqual(portfolio.search('anything'), [])
    assert.equal(portfolio.sections().projects, undefined)
    assert.ok(portfolio.toMarkdown().includes('Sam Okafor'))
  })

  test('rejects things that are not manifests', () => {
    for (const bad of [null, 'a string', 42, []]) {
      assert.equal(validateManifest(bad).valid, false)
    }
  })
})

describe('discovery', () => {
  test('follows the link tag on a page rather than scraping it', async () => {
    const { fetch, asked } = stubFetch({
      'https://marina.example.org/': { type: 'text/html', body: pageHtml },
      'https://marina.example.org/portfolio.json': { type: 'application/json', body: JSON.stringify(fictional) },
    })
    const { manifest, url } = await discoverManifest('https://marina.example.org/', { fetch })

    assert.equal(manifest.person.name, 'Marina Delacroix')
    assert.equal(url, 'https://marina.example.org/portfolio.json')
    assert.equal(asked[0], 'https://marina.example.org/', 'the page is read only to find the pointer')
  })

  test('falls back to convention when a page declares nothing', async () => {
    const { fetch } = stubFetch({
      'https://x.test/p/': { type: 'text/html', body: '<html><head></head><body></body></html>' },
      'https://x.test/p/portfolio.json': { type: 'application/json', body: JSON.stringify(fictional) },
    })
    const { url } = await discoverManifest('https://x.test/p/', { fetch })
    assert.equal(url, 'https://x.test/p/portfolio.json')
  })

  test('reports a clear error when nothing is found', async () => {
    const { fetch } = stubFetch({})
    await assert.rejects(
      () => discoverManifest('https://nothing.test/', { fetch }),
      (error) => error instanceof PortfolioError && error.code === 'not-found',
    )
  })

  test('survives a network failure without hanging', async () => {
    const fetch = async () => { throw new Error('ECONNREFUSED') }
    await assert.rejects(() => discoverManifest('https://down.test/', { fetch }), PortfolioError)
  })

  test('a manifest URL is taken at its word', () => {
    assert.deepEqual(candidates('https://x.test/custom.json'), ['https://x.test/custom.json'])
  })

  test('a project-site path is tried before the origin root', () => {
    // The reason `.well-known` was rejected: on GitHub Pages the origin root is someone
    // else's site entirely.
    const found = candidates('https://user.github.io/repo/')
    assert.ok(found.indexOf('https://user.github.io/repo/portfolio.json')
      < found.indexOf('https://user.github.io/portfolio.json'))
  })

  test('reads the link tag out of real markup', () => {
    assert.equal(
      linkedManifest(pageHtml, 'https://marina.example.org/'),
      'https://marina.example.org/portfolio.json',
    )
    assert.equal(linkedManifest('<html><head></head></html>', 'https://x.test/'), undefined)
  })
})

describe('entities', () => {
  test('exposes each collection', () => {
    const portfolio = agent()
    assert.equal(portfolio.getProjects().length, 3)
    assert.equal(portfolio.getExperience().length, 2)
    assert.equal(portfolio.getPublications().length, 1)
    assert.equal(portfolio.getSkills().length, 4)
  })

  test('reports which sections have content', () => {
    const sections = agent().sections()
    assert.equal(sections.projects, 3)
    assert.equal(sections.videos, undefined)
  })

  test('resolves an entity by id', () => {
    const portfolio = agent()
    const [first] = portfolio.search('terrain-relative navigation sonar', { types: ['projects'] })
    assert.equal(portfolio.entity(first.id).name, 'abyssal-nav')
    assert.equal(portfolio.entity('nope/missing'), undefined)
  })
})

describe('provenance', () => {
  test('a skill answers with evidence, not by repeating its own name', () => {
    // "Does she know C++?" should be answerable with what demonstrates it.
    const found = agent().findSkill('C++')
    assert.equal(found.skill.name, 'C++')
    assert.equal(found.evidence[0].label, '18 repositories')
    assert.ok(found.usedIn.some((u) => u.title === 'abyssal-nav'), 'and where it is actually used')
  })

  test('a skill with no evidence still resolves, reporting none', () => {
    const found = agent().findSkill('PyTorch')
    assert.deepEqual(found.evidence, [])
  })

  test('search results carry the provenance of the record', () => {
    const [result] = agent().search('terrain-relative navigation', { types: ['projects'] })
    assert.equal(result.provenance.source, 'github')
    assert.equal(result.provenance.url, 'https://github.com/mdelacroix/abyssal-nav')
  })

  test('getEvidence explains one entity', () => {
    const portfolio = agent()
    const [result] = portfolio.search('perception lead', { types: ['experience'] })
    const evidence = portfolio.getEvidence(result.id)
    assert.equal(evidence.source, 'linkedin')
    assert.equal(evidence.confidence, 0.9)
  })
})

describe('exports', () => {
  test('Markdown is structured prose, not a JSON dump', () => {
    const markdown = agent().toMarkdown()
    assert.match(markdown, /^# Marina Delacroix/m)
    assert.match(markdown, /## Experience/)
    assert.match(markdown, /abyssal-nav/)
    assert.ok(!markdown.includes('"schemaVersion"'))
    assert.ok(!markdown.includes('{'), 'no raw objects leak into the output')
  })

  test('Markdown omits internal identifiers', () => {
    const markdown = agent().toMarkdown()
    assert.ok(!markdown.includes('ifremer-perception-lead'))
    assert.ok(!markdown.includes('schemaVersion'))
  })

  test('one entity renders on its own', () => {
    const portfolio = agent()
    const [result] = portfolio.search('coral reef detection', { types: ['projects'] })
    const markdown = portfolio.toMarkdown({ entity: result.id })
    assert.match(markdown, /reef-vision/)
    assert.match(markdown, /## Technologies/)
    assert.ok(!markdown.includes('Marina Delacroix'), 'an entity export is not the whole profile')
  })

  test('the prompt grounds the model before it shows any data', () => {
    const prompt = agent().toPrompt()
    const preambleEnds = prompt.indexOf('---')
    assert.ok(prompt.slice(0, preambleEnds).includes('Use only the information'))
    assert.ok(prompt.slice(0, preambleEnds).includes('say so'))
    assert.ok(prompt.includes('Marina Delacroix'))
  })

  test('an entity prompt says it is not the whole profile', () => {
    // Without this a model handed one project answers "what has she built?" as though that
    // project were the entire career.
    const portfolio = agent()
    const [result] = portfolio.search('coral reef', { types: ['projects'] })
    const prompt = portfolio.toPrompt({ entity: result.id })
    assert.match(prompt, /one project from a larger portfolio/)
  })

  test('a question is embedded when supplied', () => {
    assert.match(agent().toPrompt({ question: 'What has she built with C++?' }), /Question: What has she built with C\+\+\?/)
  })
})

describe('ask()', () => {
  test('refuses clearly when no model is supplied', async () => {
    await assert.rejects(
      () => agent().ask('anything', {}),
      (error) => error.code === 'no-provider' && /ships no provider/.test(error.message),
    )
  })

  test('uses the caller-supplied model and returns grounding alongside the answer', async () => {
    let seen = ''
    const result = await agent().ask('What has she built with C++?', {
      complete: async (prompt) => { seen = prompt; return 'She built abyssal-nav.' },
    })

    assert.equal(result.answer, 'She built abyssal-nav.')
    assert.ok(seen.includes('Use only the information'), 'the model receives the grounded prompt')
    assert.ok(result.grounding.length > 0, 'and deterministic sources travel with the answer')
  })
})

describe('generality', () => {
  test('nothing in the package assumes whose portfolio it is reading', () => {
    // The fixture is deliberately unlike the portfolio in this repository. If any host,
    // person, section or field name were special-cased, this suite would not pass at all.
    const portfolio = agent()
    assert.ok(portfolio.search('robotics').length > 0)
    assert.ok(portfolio.toMarkdown().length > 200)
    assert.equal(portfolio.capabilities.provenance, true)
  })

  test('a publisher that leaked private fields is still only read, never re-published', () => {
    // The package does not sanitise — that is the publisher's job, enforced at build time by
    // `core/standard/public.js`. What it must not do is *depend* on those fields being absent.
    const portfolio = PortfolioAgent.fromManifest(leaky)
    assert.equal(portfolio.person.contact.email, 'marina@example.org')
    assert.ok(portfolio.toMarkdown().includes('Marina Delacroix'))
  })
})
