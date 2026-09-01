import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { toPublicManifest, NEVER_PUBLISHED } from '../src/core/standard/public.js'
import { manifestCandidates, manifestLinkTag, MANIFEST_FILENAME } from '../src/core/standard/discovery.js'
import { validateDocument, SCHEMA_VERSION } from '../src/core/standard/document.js'
import { normalizeProfile } from '../src/core/schema/profile.js'

/** A profile with something in every position that matters to the privacy boundary. */
const profile = () => normalizeProfile({
  identity: {
    name: 'Ada Lovelace',
    headline: 'Analytical Engine Programmer',
    location: 'London',
    contact: {
      email: 'ada@example.com',
      phone: '+44 7700 900000',
      website: 'https://ada.example.com',
    },
  },
  socials: { github: 'https://github.com/ada' },
  experience: [{ company: 'Acme', role: 'Engineer', source: { connector: 'github' } }],
  skills: [{ name: 'Python', evidence: [{ label: '12 repositories', count: 12, connector: 'github' }] }],
  projects: [{ name: 'analytical-engine', description: 'A machine.' }],
})

describe('the public manifest as a privacy boundary', () => {
  test('a phone number is never published, whatever the configuration says', () => {
    // No connector can import a phone number — its presence means a human typed it into
    // their own config. That is consent to render it on their page, not consent to publish
    // it as a bulk-collectable record. There is deliberately no flag to re-enable this.
    for (const privacy of [{}, { hideEmail: false, obfuscateEmail: false }]) {
      const manifest = toPublicManifest(profile(), { config: { privacy } })
      assert.equal(manifest.person.contact?.phone, undefined)
    }
    assert.ok(NEVER_PUBLISHED.includes('phone'))
  })

  test('obfuscateEmail — the default — keeps the address out of the manifest', () => {
    // The regression this exists to prevent: the rendered page shows `ada [at] example.com`
    // while the manifest serves the real address in the most harvestable format there is.
    const manifest = toPublicManifest(profile(), { config: { privacy: { obfuscateEmail: true } } })
    assert.equal(manifest.person.contact?.email, undefined)
    assert.ok(!JSON.stringify(manifest).includes('ada@example.com'))
  })

  test('hideEmail keeps the address out of the manifest', () => {
    const manifest = toPublicManifest(profile(), { config: { privacy: { hideEmail: true } } })
    assert.ok(!JSON.stringify(manifest).includes('ada@example.com'))
  })

  test('an author who published their address explicitly still gets it', () => {
    const manifest = toPublicManifest(profile(), {
      config: { privacy: { hideEmail: false, obfuscateEmail: false } },
    })
    assert.equal(manifest.person.contact.email, 'ada@example.com')
  })

  test('non-contact public fields survive', () => {
    const manifest = toPublicManifest(profile(), { config: { privacy: {} } })
    // Trailing slash: the schema normalizer canonicalizes URLs, which is correct behaviour.
    assert.equal(manifest.person.contact.website, 'https://ada.example.com/')
    assert.equal(manifest.person.name, 'Ada Lovelace')
    assert.equal(manifest.socials.github, 'https://github.com/ada')
  })

  test('losing claims on disputed values are not published', () => {
    // The `evidence` block serializes every claim on a contested attribute, including the
    // ones that lost — so a privately imported résumé the author later corrected would have
    // its original wording published. Provenance for *published* values travels on the
    // records themselves instead.
    const manifest = toPublicManifest(profile(), { config: {} })
    assert.equal(manifest.evidence, undefined)
    assert.equal(manifest.experience[0].source.connector, 'github', 'per-record provenance is kept')
    assert.equal(manifest.skills[0].evidence[0].label, '12 repositories', 'skill evidence is kept')
  })
})

describe('manifest shape', () => {
  test('is a valid document under the existing standard', () => {
    // Extending the standard, not competing with it: the manifest must still read back
    // through the same validator any other conforming document goes through.
    const manifest = toPublicManifest(profile(), { config: {} })
    const result = validateDocument(manifest)
    assert.equal(result.valid, true, JSON.stringify(result.issues))
    assert.equal(manifest.schemaVersion, SCHEMA_VERSION)
  })

  test('declares capabilities so an agent can branch instead of probing', () => {
    const manifest = toPublicManifest(profile(), { config: {} })
    assert.equal(manifest.capabilities.provenance, true)
    assert.equal(manifest.capabilities.evidence, true)
    assert.equal(typeof manifest.capabilities.spec, 'string')
  })

  test('records where it was published, when a canonical URL is known', () => {
    const manifest = toPublicManifest(profile(), { config: {}, canonical: 'https://x.test/p/' })
    assert.equal(manifest.url, 'https://x.test/p/')
  })

  test('an empty profile produces a document rather than throwing', () => {
    const manifest = toPublicManifest(normalizeProfile({ identity: { name: 'X Y' } }), { config: {} })
    assert.equal(manifest.person.name, 'X Y')
    assert.deepEqual(manifest.projects, [])
  })
})

describe('discovery', () => {
  test('the link tag is well-formed and escaped', () => {
    const tag = manifestLinkTag('./portfolio.json')
    assert.match(tag, /rel="alternate"/)
    assert.match(tag, /href="\.\/portfolio\.json"/)
    assert.ok(!manifestLinkTag('"><script>').includes('<script>'))
  })

  test('a page URL resolves against its own directory first', () => {
    // The case that decided against `.well-known`: a GitHub Pages project site is mounted at
    // /repo/, so the manifest lives at /repo/portfolio.json — the origin root is a different
    // person's site entirely.
    const candidates = manifestCandidates('https://user.github.io/repo/')
    assert.equal(candidates[0], `https://user.github.io/repo/${MANIFEST_FILENAME}`)
    assert.ok(candidates.includes(`https://user.github.io/${MANIFEST_FILENAME}`), 'root is still tried')
  })

  test('a file URL resolves against the containing directory', () => {
    const candidates = manifestCandidates('https://x.test/p/index.html')
    assert.equal(candidates[0], 'https://x.test/p/portfolio.json')
  })

  test('a URL that already names a manifest is taken at its word', () => {
    assert.deepEqual(manifestCandidates('https://x.test/custom.json'), ['https://x.test/custom.json'])
  })

  test('an unparseable URL yields nothing rather than throwing', () => {
    assert.deepEqual(manifestCandidates('not a url'), [])
  })
})

let resultsToMarkdownSync
describe('search cannot reach what the manifest withholds', () => {
  test('a private field is absent from the index, results and copied output', async () => {
    // The regression this exists to prevent: search is wired to the richer internal `profile`
    // instead of the public manifest, and a phone number or a suppressed email becomes
    // findable by typing it — with the page still showing none of it.
    const { PortfolioAgent, resultsToMarkdown, resultsToPrompt } = await import('@portfolio-engine/agent')
    resultsToMarkdownSync = resultsToMarkdown

    const secrets = ['+44 7700 900000', 'ada@example.com']
    const manifest = toPublicManifest(profile(), { config: { privacy: { obfuscateEmail: true } } })
    const agent = PortfolioAgent.fromManifest(manifest, { strict: false })

    for (const secret of secrets) {
      assert.ok(!JSON.stringify(manifest).includes(secret), `${secret} reached the manifest`)

      // Searching for it directly must surface nothing containing it, whatever ranking returns.
      const direct = agent.search(secret, { limit: 10 })
      assert.ok(!JSON.stringify(direct).includes(secret), `${secret} reached a search result`)

      // And it must not appear in copied output for an ordinary query either. Deliberately a
      // *different* query than the secret: `resultsToMarkdown` echoes the question back, so
      // searching the secret and finding it in the "Question:" line would prove nothing about
      // the portfolio boundary — that string is the user's own keystrokes, not a record.
      const ordinary = agent.search('engineer', { limit: 10 })
      assert.ok(!resultsToMarkdown(ordinary, { query: 'engineer' }).includes(secret), `${secret} reached copied Markdown`)
      assert.ok(!resultsToPrompt(ordinary, { query: 'engineer' }).includes(secret), `${secret} reached a copied prompt`)
    }
  })

  test('copied output echoes the question, and only the question, from user input', () => {
    // Documenting the behaviour the test above deliberately excludes: the question is included
    // because a result set is uninterpretable without it. It is the searcher's own text, so it
    // carries no portfolio data — but anyone pasting the result elsewhere is also pasting what
    // they typed, which is worth stating rather than leaving implicit.
    const markdown = resultsToMarkdownSync([], { query: 'anything typed here' })
    assert.match(markdown, /anything typed here/)
  })

  test('the whole index is derived from the manifest, never the profile', async () => {
    const { buildIndex } = await import('@portfolio-engine/agent')
    const manifest = toPublicManifest(profile(), { config: { privacy: { obfuscateEmail: true } } })
    const blob = JSON.stringify(buildIndex(manifest))
    assert.ok(!blob.includes('+44 7700 900000'))
    assert.ok(!blob.includes('ada@example.com'))
  })
})
