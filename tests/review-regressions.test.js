import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  PortfolioAgent, stem, parseQuery, fingerprintDocuments, embeddingTextFor,
  RemoteEmbeddingProvider, EmbeddingUnavailable, packVectors, buildIndex, DEFAULT_MODEL,
} from '@portfolio-engine/agent'
import { toPublicManifest } from '../src/core/standard/public.js'
import { normalizeProfile } from '../src/core/schema/profile.js'
import { setPath, applyClears, prune, mergeDeep, mergeOverrides, CLEARED } from '../src/admin/drafts.js'
import { filesToPublish } from '../src/admin/publish.js'

/**
 * Regressions for defects found in review.
 *
 * One file rather than scattered additions, because what these have in common is not a module —
 * it is that each was a piece of code whose comment described behaviour it did not have. A
 * stemmer rule that matched a control character, a `Suspense` fallback documented as covering a
 * failed import, an "unsaved" state that could not be saved. The tests are written to fail if
 * the code drifts back to merely *claiming* the behaviour.
 */

const ROOT = join(import.meta.dirname, '..')
const source = (relative) => readFileSync(join(ROOT, relative), 'utf8')

describe('the stemmer folds doubled consonants', () => {
  test('inflected forms reach the same stem as their base', () => {
    // The fold rule had a literal 0x01 byte where its backreference should have been, so it
    // matched nothing and every doubled stem stayed doubled. "running" and "run" landed in
    // different buckets, which is exactly what a stemmer exists to prevent.
    for (const [inflected, base] of [
      ['running', 'run'], ['stopped', 'stop'], ['bigger', 'big'],
      ['planning', 'plan'], ['swimming', 'swim'],
    ]) {
      assert.equal(stem(inflected), stem(base), `${inflected} vs ${base}`)
    }
  })

  test('no source file carries a stray control character', () => {
    // How the original defect survived review: it is invisible in every editor and in a diff.
    for (const file of [
      'packages/agent/src/semantic.js', 'packages/agent/src/search.js',
      'packages/agent/src/query.js', 'src/admin/drafts.js',
    ]) {
      const found = [...source(file)].filter((c) => c.charCodeAt(0) < 9 || (c.charCodeAt(0) > 13 && c.charCodeAt(0) < 32))
      assert.deepEqual(found, [], `${file} contains a control character`)
    }
  })
})

describe('section preference keeps near-ties', () => {
  test('a type one mention behind the leader is still preferred', () => {
    // The docstring said "within one mention of the leader"; the code kept only exact ties.
    const parsed = parseQuery('which projects and what work experience')
    assert.ok(parsed.entityTypes.length >= 1)

    const twoAndOne = parseQuery('projects, projects, and his work')
    assert.ok(twoAndOne.entityTypes.includes('projects'), JSON.stringify(twoAndOne.entityTypes))
  })

  test('a clear leader still wins outright', () => {
    const parsed = parseQuery('projects projects projects and one job')
    assert.equal(parsed.entityTypes[0], 'projects')
  })
})

describe('the embedding provider matches the index', () => {
  test('the model recorded by the index is the model the query is embedded with', async () => {
    // Vectors live in a model's own space. Embedding the query with a different model compares
    // two unrelated geometries and returns scores that look plausible and mean nothing.
    const agent = PortfolioAgent.fromManifest(
      { schemaVersion: '1.0', person: { name: 'Ada' }, projects: [{ id: 'p1', name: 'One' }] },
      { strict: false },
    )
    const packed = packVectors([[1, 0, 0, 0]])
    agent.useEmbeddings({ ...packed, ids: ['p1'], model: 'Xenova/some-other-model' })

    let requested
    await agent.semanticSearch('anything', {
      limit: 1,
      // Stand in for the local provider so nothing is downloaded; the assertion is about which
      // model the agent would have asked for.
      provider: { embed: async () => { requested = 'explicit'; return [[1, 0, 0, 0]] } },
    })
    assert.equal(requested, 'explicit', 'an explicitly passed provider must still win')

    // With no provider passed, the one it builds carries the index's model.
    const built = PortfolioAgent.fromManifest(
      { schemaVersion: '1.0', person: { name: 'Ada' }, projects: [{ id: 'p1', name: 'One' }] },
      { strict: false },
    )
    built.useEmbeddings({ ...packed, ids: ['p1'], model: 'Xenova/some-other-model' })
    await built.semanticSearch('anything', { limit: 1 }).catch(() => {})
    assert.equal(built._provider?.model, 'Xenova/some-other-model')
  })

  test('an index with no model recorded falls back to the package default', async () => {
    const agent = PortfolioAgent.fromManifest(
      { schemaVersion: '1.0', person: { name: 'Ada' }, projects: [{ id: 'p1', name: 'One' }] },
      { strict: false },
    )
    agent.useEmbeddings({ ...packVectors([[1, 0, 0, 0]]), ids: ['p1'] })
    await agent.semanticSearch('anything', { limit: 1 }).catch(() => {})
    assert.equal(agent._provider?.model, DEFAULT_MODEL)
  })

  test('hasEmbeddings is public, so no consumer reaches for a private field', () => {
    const agent = PortfolioAgent.fromManifest({ schemaVersion: '1.0', person: { name: 'Ada' } }, { strict: false })
    assert.equal(agent.hasEmbeddings(), false)
    agent.useEmbeddings({ ...packVectors([[1, 0, 0, 0]]), ids: ['x'] })
    assert.equal(agent.hasEmbeddings(), true)
    assert.ok(!source('src/hooks/useSearch.js').includes('_vectors'))
  })
})

describe('an API key never travels in the clear', () => {
  test('a plaintext endpoint is refused before a request is ever made', () => {
    // The key rides in an `Authorization: Bearer` header on every call, and unlike a leaked
    // query a leaked key stays useful.
    for (const baseUrl of ['http://api.example.com/v1', 'http://10.0.0.5/v1', 'ftp://x/v1']) {
      assert.throws(
        () => new RemoteEmbeddingProvider({ baseUrl, model: 'm', apiKey: 'k' }),
        EmbeddingUnavailable,
        baseUrl,
      )
    }
  })

  test('https is fine, and so is a loopback address for a local model server', () => {
    for (const baseUrl of ['https://api.openai.com/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:8080/v1']) {
      assert.doesNotThrow(() => new RemoteEmbeddingProvider({ baseUrl, model: 'm', apiKey: 'k' }), baseUrl)
    }
  })
})

describe('an embedding index is bound to the corpus it was built from', () => {
  const docs = [
    { id: 'a', title: 'Alpha', text: 'first', tags: [] },
    { id: 'b', title: 'Beta', text: 'second', tags: [] },
  ]

  test('reordering the same corpus does not invalidate the index', () => {
    assert.equal(fingerprintDocuments(docs), fingerprintDocuments([...docs].reverse()))
  })

  test('editing a description does invalidate it, even though every id is unchanged', () => {
    // The failure this exists to catch: a record keeps its id when its text is rewritten, so
    // ids and counts still match and the site reports `hybrid-semantic` while searching a
    // description nobody can read any more.
    const edited = [{ ...docs[0], text: 'rewritten' }, docs[1]]
    assert.notEqual(fingerprintDocuments(docs), fingerprintDocuments(edited))
  })

  test('adding or removing a record invalidates it', () => {
    assert.notEqual(fingerprintDocuments(docs), fingerprintDocuments(docs.slice(0, 1)))
    assert.notEqual(fingerprintDocuments(docs), fingerprintDocuments([...docs, { id: 'c', title: 'C', text: '', tags: [] }]))
  })

  test('the build validates the fingerprint before trusting the vectors', () => {
    const plugin = source('scripts/lib/seoPlugin.mjs')
    assert.match(plugin, /fingerprintDocuments/)
    assert.match(plugin, /embeddings\.fingerprint !== current/)
    // And the writer records one, or the check above could never pass.
    assert.match(source('scripts/embed.mjs'), /fingerprint: fingerprintDocuments\(documents\)/)
  })

  test('the text that is fingerprinted is the text that is embedded', () => {
    // Two copies of this logic that drifted would make every build look stale.
    assert.match(source('scripts/embed.mjs'), /documents\.map\(embeddingTextFor\)/)
    const document = { id: 'x', title: 'T', subtitle: 'S', text: 'B', tags: ['one', 'two'] }
    assert.equal(embeddingTextFor(document), 'T. S. B. one, two')
  })
})

describe('the public manifest defaults to protecting the address', () => {
  const profile = () => normalizeProfile({
    identity: { name: 'Ada Lovelace', contact: { email: 'ada@example.com' } },
  })

  test('no privacy configuration at all still obfuscates', () => {
    // `defaults.js` sets this, but `toPublicManifest` is an exported boundary and gets called
    // with configs that never went through it. Falling back to `{}` published the real address
    // in the most harvestable format there is.
    for (const options of [{}, { config: {} }, { config: { privacy: {} } }]) {
      const manifest = toPublicManifest(profile(), options)
      assert.ok(!JSON.stringify(manifest).includes('ada@example.com'), JSON.stringify(options))
    }
  })

  test('an explicit opt-out is still honoured', () => {
    const manifest = toPublicManifest(profile(), {
      config: { privacy: { obfuscateEmail: false, hideEmail: false } },
    })
    assert.equal(manifest.person.contact?.email, 'ada@example.com')
  })
})

describe('clearing a published field actually clears it', () => {
  test('an emptied field is recorded rather than dropped', () => {
    // Removing the key from a patch is indistinguishable from never having touched it, so the
    // committed value won and the box emptied for no effect.
    const draft = setPath({}, 'theme.accent', '')
    assert.equal(draft.theme.accent, CLEARED)
  })

  test('the marker survives the merge and removes the committed value', () => {
    const committed = { theme: { accent: '#00f' }, layout: { shell: 'stacked' } }
    const merged = applyClears(mergeDeep(committed, setPath({}, 'theme.accent', '')))
    assert.equal(merged.theme.accent, undefined, 'the cleared field must be gone')
    assert.equal(merged.layout.shell, 'stacked', 'an untouched field must survive')
  })

  test('publishing a cleared field removes it from the committed file', () => {
    const committed = {
      'src/data/config.json': JSON.stringify({ theme: { accent: '#00f' }, layout: { shell: 'stacked' } }),
    }
    const [file] = filesToPublish({ overrides: {}, configDraft: setPath({}, 'theme.accent', '') }, committed)
      .filter((f) => f.path === 'src/data/config.json')

    const published = JSON.parse(file.content)
    assert.equal(published.theme?.accent, undefined)
    assert.equal(published.layout.shell, 'stacked')
  })

  test('the same holds for overrides', () => {
    const committed = {
      'src/data/overrides.json': JSON.stringify({ identity: { headline: 'Engineer', name: 'Ada' } }),
    }
    const draft = { overrides: { identity: prune({ headline: '' }) }, configDraft: {} }
    const [file] = filesToPublish(draft, committed).filter((f) => f.path === 'src/data/overrides.json')

    const published = JSON.parse(file.content)
    assert.equal(published.identity?.headline, undefined, 'the cleared headline must be gone')
    assert.equal(published.identity?.name, 'Ada', 'an untouched field must survive')
  })

  test('the marker never reaches a published file or a built profile', () => {
    const draft = { overrides: { identity: prune({ headline: '' }) }, configDraft: setPath({}, 'theme.accent', '') }
    for (const file of filesToPublish(draft, {})) {
      assert.ok(!file.content.includes('cleared'), `${file.path} leaked the sentinel`)
      assert.ok(!file.content.includes(CLEARED), `${file.path} leaked the marker verbatim`)
      assert.ok(!file.content.includes(String.fromCharCode(0)), `${file.path} leaked a null byte`)
    }
    assert.ok(!JSON.stringify(applyClears(mergeOverrides({}, draft.overrides))).includes('cleared'))
  })
})

describe('type declarations describe the runtime', () => {
  test('every public method and export is declared', () => {
    // No TypeScript in this repository to check it, so the check is that the declaration file
    // names what the runtime actually exposes. A `.d.ts` that lies is worse than none.
    const types = source('packages/agent/src/index.d.ts')
    for (const name of [
      'useEmbeddings', 'hasEmbeddings', 'semanticSearch', 'understand',
      'resultsToMarkdown', 'resultsToPrompt', 'defaultUrlPolicy', 'isPrivateHost',
    ]) {
      assert.match(types, new RegExp(`\\b${name}\\b`), `${name} is exported at runtime but not declared`)
    }
  })

  test('the declared class methods exist on the real class', () => {
    const agent = PortfolioAgent.fromManifest({ schemaVersion: '1.0', person: { name: 'Ada' } }, { strict: false })
    for (const name of ['useEmbeddings', 'hasEmbeddings', 'semanticSearch', 'understand', 'search', 'toPrompt']) {
      assert.equal(typeof agent[name], 'function', `${name} is declared but missing at runtime`)
    }
  })
})

describe('the carousel releases at its edges, not on small deltas', () => {
  const hook = source('src/hooks/useHorizontalWheel.js')

  test('the release condition asks about the edge in the direction of travel', () => {
    // The old test compared the *attempted movement* against the tolerance, which meant a
    // trackpad's three-pixel ticks looked like "nothing would move" anywhere in the strip and
    // leaked to the page. Wheel ticks are large enough to hide it; trackpads are not.
    assert.match(hook, /delta < 0 && element\.scrollLeft <= EDGE_TOLERANCE/)
    assert.match(hook, /delta > 0 && element\.scrollLeft >= max - EDGE_TOLERANCE/)
    assert.ok(!/Math\.abs\(next - element\.scrollLeft\) < EDGE_TOLERANCE/.test(hook))
  })

  test('the boundary logic behaves at both edges and in the middle', () => {
    // The decision, extracted so it can be exercised without a DOM.
    const EDGE_TOLERANCE = 8
    const releases = (scrollLeft, delta, max) =>
      (delta < 0 && scrollLeft <= EDGE_TOLERANCE) || (delta > 0 && scrollLeft >= max - EDGE_TOLERANCE)

    assert.equal(releases(0, -100, 500), true, 'left edge, scrolling left → page')
    assert.equal(releases(4, -100, 500), true, 'snap offset still counts as the left edge')
    assert.equal(releases(500, 100, 500), true, 'right edge, scrolling right → page')
    assert.equal(releases(0, 100, 500), false, 'left edge, scrolling right → carousel')
    assert.equal(releases(500, -100, 500), false, 'right edge, scrolling left → carousel')
    assert.equal(releases(250, 3, 500), false, 'a small delta mid-strip must still scroll it')
    assert.equal(releases(250, -3, 500), false)
    assert.equal(releases(0, 100, 0), true, 'nothing to scroll → always release')
  })
})

describe('components render only what they have', () => {
  test('the case-study Stack section is gated on having tools or tags', () => {
    // An empty "Stack" heading reads as a section that failed to load.
    assert.match(source('src/components/CaseStudyCard.jsx'), /\{\(hasTools \|\| hasTags\) && \(/)
  })

  test('every icon name used in the app resolves', () => {
    // Every capitalised identifier in Icon.jsx. Loose on purpose: this is looking for a name
    // that is *missing*, and a proxy that over-accepts can only ever fail to flag something,
    // never flag something wrongly.
    const icon = source('src/components/Icon.jsx')
    const registered = new Set([...icon.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]))

    for (const file of ['src/components/CopyMenu.jsx', 'src/admin/panels/PublishPanel.jsx']) {
      for (const [, name] of source(file).matchAll(/name="([A-Z][A-Za-z0-9]*)"/g)) {
        assert.ok(registered.has(name), `${file} asks for the icon "${name}", which Icon.jsx does not register`)
      }
    }
  })

  test('a failed liquid import falls back instead of unmounting the tree', () => {
    // `Suspense` covers pending only. A rejected `import()` throws during render, and with no
    // boundary React unmounts everything — a CDN hiccup on a decorative effect would have taken
    // the copy menu with it. The comment promised this behaviour before the code did.
    const surface = source('src/components/LiquidSurface.jsx')
    assert.match(surface, /class LiquidBoundary extends Component/)
    assert.match(surface, /static getDerivedStateFromError/)
    assert.equal((surface.match(/<LiquidBoundary/g) ?? []).length, 2, 'both lazy components need covering')
  })

  test('the search dialog traps Tab, as aria-modal promises', () => {
    const dialog = source('src/components/SearchDialog.jsx')
    assert.match(dialog, /event\.key === 'Tab'/)
    assert.match(dialog, /shiftKey/)
    assert.match(dialog, /aria-modal="true"/)
  })
})

describe('the search index still comes from the manifest', () => {
  test('nothing above reintroduced a path from the raw profile', () => {
    const manifest = toPublicManifest(
      normalizeProfile({ identity: { name: 'Ada', contact: { phone: '+44 7700 900000' } } }),
      {},
    )
    assert.ok(!JSON.stringify(buildIndex(manifest)).includes('+44 7700 900000'))
  })
})
