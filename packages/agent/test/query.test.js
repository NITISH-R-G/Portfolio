import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { PortfolioAgent, parseQuery, describeQuery } from '../src/index.js'
import { fictional } from './fixtures.js'

/**
 * Conversational retrieval, tested against the fictional fixture rather than the real
 * portfolio — the same discipline the rest of this package follows, so a Nitish-shaped
 * assumption cannot pass unnoticed.
 */
const portfolio = () => PortfolioAgent.fromManifest(fictional, { strict: false })

/** The types of the top `n` results, for asserting shape without asserting exact ordering. */
const types = (results, n = 3) => results.slice(0, n).map((r) => r.type)
const titles = (results) => results.map((r) => r.title)

describe('reading a question', () => {
  test('names the section a question is about', () => {
    assert.deepEqual(parseQuery('Where did he study?').entityTypes, ['education'])
    assert.deepEqual(parseQuery('What companies has he worked with?').entityTypes, ['experience'])
    assert.deepEqual(parseQuery('What has he published?').entityTypes, ['publications'])
    assert.deepEqual(parseQuery('Which projects use Python?').entityTypes, ['projects'])
    assert.deepEqual(parseQuery('What certifications does he have?').entityTypes, ['certifications'])
  })

  test('reads intent from words the term matcher throws away', () => {
    // `work`, `built`, `know` are stop words for *matching* — they appear everywhere and
    // narrow nothing. As *intent* they are the entire question, so parsing happens before
    // stop-word removal.
    assert.deepEqual(parseQuery('what has he built?').entityTypes, ['projects'])
    assert.deepEqual(parseQuery('where has he worked?').entityTypes, ['experience'])
  })

  test('a word spent naming the section is not also a search term', () => {
    // The bug this prevents: "study" matched project text lexically and buried the education
    // records the question was actually asking for.
    const parsed = parseQuery('Where did he study?')
    assert.ok(!parsed.terms.includes('study'))
  })

  test('a broad question about the person prefers nothing', () => {
    // "Tell me about his work" is not a question about employment records.
    assert.deepEqual(parseQuery('tell me about his work').entityTypes, [])
    assert.equal(parseQuery('tell me about his work').broad, true)
  })

  test('substrings do not trigger a section', () => {
    // "work" inside "network", "rank" inside "frankly", "post" inside "postgres".
    assert.deepEqual(parseQuery('network architecture').entityTypes, [])
    assert.deepEqual(parseQuery('postgres tuning').entityTypes, [])
  })

  test('the reading is explainable', () => {
    assert.match(describeQuery(parseQuery('Where did he study?')), /education/)
    assert.equal(describeQuery(parseQuery('rust')), undefined)
  })

  test('any input parses without throwing', () => {
    for (const input of ['', '   ', null, undefined, '???', '🙂']) {
      assert.doesNotThrow(() => parseQuery(/** @type {any} */ (input)))
    }
  })
})

describe('conversational queries reach the right evidence', () => {
  test('natural questions find what keywords would', () => {
    const p = portfolio()
    for (const query of [
      'What projects use Python?',
      'Which projects involve computer vision?',
      'What has she built with Rust?',
    ]) {
      const results = p.search(query, { limit: 5 })
      assert.ok(results.length, `no results for ${query}`)
      assert.equal(types(results, 1)[0], 'projects', `${query} should lead with a project`)
    }
  })

  test('paraphrases reach the same evidence as the direct term', () => {
    const p = portfolio()
    const direct = p.search('computer vision', { limit: 5 })
    const paraphrased = p.search('work involving visual recognition', { limit: 5 })

    assert.ok(direct.length && paraphrased.length)
    // Not identical ordering — equivalent reach. The concept layer is what connects
    // "visual recognition" to a record described as "object detection".
    const overlap = titles(paraphrased).filter((t) => titles(direct).includes(t))
    assert.ok(overlap.length > 0, 'paraphrase found none of the same records')
  })

  test('a structural question is answered from its section', () => {
    const p = portfolio()
    const results = p.search('Where did he study?')
    assert.ok(results.length)
    assert.equal(results[0].type, 'education')
    // And it says how it got there, rather than implying a term matched.
    assert.equal(results[0].reason, 'section')
  })

  test('a section question whose words match nothing still answers', () => {
    const p = portfolio()
    const results = p.search('What companies has he worked with?')
    assert.ok(results.length, 'should fall back to the experience section')
    assert.equal(results[0].type, 'experience')
  })

  test('co-occurrence outranks repetition', () => {
    // "React and TypeScript together" is a question about both appearing, not about whichever
    // record says "React" most often.
    const p = portfolio()
    const results = p.search('Which projects use Python and PyTorch together?', { limit: 5 })
    assert.ok(results.length)
    assert.equal(results[0].title, 'reef-vision', 'the record carrying both should lead')
  })
})

describe('an empty section answers honestly', () => {
  test('a question about a section with no records returns nothing', () => {
    // Preferable to inventing something, and the reason the UI says "No matching evidence
    // found" rather than showing an unrelated best guess.
    const manifest = { ...fictional, publications: [] }
    const p = PortfolioAgent.fromManifest(manifest, { strict: false })
    assert.deepEqual(p.search('What has he published?'), [])
  })
})

describe('relevance is never upgraded into fact', () => {
  test('every result still carries why it matched', () => {
    const p = portfolio()
    for (const result of p.search('Which projects involve computer vision?', { limit: 5 })) {
      assert.ok(Array.isArray(result.matched), 'matched must survive')
      assert.ok(typeof result.score === 'number')
      assert.ok('provenance' in result || result.reason === 'section')
    }
  })

  test('a section result does not claim a term matched', () => {
    const p = portfolio()
    const [top] = p.search('Where did he study?')
    assert.deepEqual(top.matched, [], 'no terms matched, so none may be reported')
    assert.equal(top.reason, 'section')
  })

  test('an unsupported question does not manufacture a supporting record', () => {
    const p = portfolio()
    // None of these are established by the fixture. Retrieval may return related records —
    // that is its job — but it must never mark them as answering the question, and the
    // evidence it returns must be the record's own.
    for (const query of [
      'How many years of professional experience does he have?',
      'Was he the lead developer?',
      'Does he have 5 years of ML experience?',
    ]) {
      for (const result of p.search(query, { limit: 3 })) {
        const blob = JSON.stringify(result).toLowerCase()
        assert.ok(!blob.includes('years of experience'), 'must not synthesise a tenure claim')
        assert.ok(!blob.includes('lead developer') || blob.includes('"record"'),
          'any such phrase must come from the record itself')
      }
    }
  })
})
