import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { loadCorpus } from '../benchmarks/corpus.js'
import { scoreCase, aggregate, same, flattenScalars, supports, gateFailures } from '../benchmarks/score.js'
import { PROVIDERS } from '../benchmarks/providers.js'
import { parseHtml } from '../src/core/extraction/html.js'
import { readSignals } from '../src/core/extraction/signals.js'
import { normalizeSignals } from '../src/core/extraction/normalize.js'

/**
 * Floors, not targets.
 *
 * Set a little below the measured scores so ordinary variation does not fail the build,
 * while a real regression does. They are deliberately *floors* rather than exact values:
 * pinning the exact number would mean every genuine improvement breaks the test, and the
 * habit that creates — updating the expected number until it passes — is how a regression
 * guard stops guarding anything.
 *
 * Raise them when a change genuinely raises the scores. Lowering one is a decision that
 * deserves a sentence in the commit message.
 */
const FLOOR = {
  // Lowered from 0.85 when the corpus gained five fixtures whose content only exists after
  // JavaScript runs. The built-in provider cannot read those by construction, so its
  // corpus-wide recall fell without anything about it getting worse. Recording the reason
  // here rather than quietly editing the number, because "the floor moved down" and "the
  // extractor got worse" have to stay distinguishable.
  recall: 0.75,
  accuracy: 0.95,
  precision: 0.97,
  structure: 1,
  evidence: 0.95,
  validity: 0.95,
}

/** The same floors, over the pages a static fetch can actually see. */
const STATIC_FLOOR = { recall: 0.85 }

/** Run the whole corpus through a provider, exactly as `npm run benchmark` does. */
async function runProvider(provider, corpus) {
  const scores = []
  for (const testCase of corpus) {
    const signals = await provider.extract({ html: testCase.html, url: testCase.expected.url })
    const extraction = normalizeSignals(signals, { url: testCase.expected.url, sourceId: provider.id })
    scores.push(scoreCase(testCase, extraction, { ms: 0, failed: false }))
  }
  return aggregate(scores)
}

/* -------------------------------------------------------------------------- */

describe('the extraction corpus', () => {
  test('every fixture has ground truth, and every ground truth has a url', async () => {
    const corpus = await loadCorpus()
    assert.ok(corpus.length >= 5, 'a corpus this small cannot say much')

    for (const testCase of corpus) {
      assert.ok(testCase.expected.url, `${testCase.slug} has no url`)
      assert.ok(testCase.expected.profile, `${testCase.slug} has no expected profile`)
      assert.ok(testCase.expected.note, `${testCase.slug} does not say what it tests`)
    }
  })

  test('the corpus covers the cases that decide the architecture', async () => {
    const traits = new Set((await loadCorpus()).flatMap((c) => c.expected.traits ?? []))

    // Each of these is a reason someone would reach for a paid provider. A corpus missing
    // one cannot answer whether that reach is justified.
    for (const trait of ['json-ld', 'microdata', 'no-structured-data', 'javascript', 'entity-resolution']) {
      assert.ok(traits.has(trait), `no case exercises "${trait}"`)
    }
  })
})

describe('scoring', () => {
  test('the same fact written differently is one fact', () => {
    assert.ok(same('Senior Engineer', 'senior engineer', 'role'))
    assert.ok(same('Google', 'Google, Inc.', 'company'))
    assert.ok(same('https://a.example', 'https://a.example/', 'website'))
    assert.ok(same(['React', 'TypeScript'], ['typescript', 'react'], 'technologies'))
  })

  test('different facts are not the same fact', () => {
    assert.ok(!same('Senior Engineer', 'Staff Engineer', 'role'))
    assert.ok(!same('Northwind Systems', 'Northwind Traders', 'company'))
    assert.ok(!same({ iso: '2022-01-01', precision: 'year' }, { iso: '2022-01-01', precision: 'day' }, 'date'),
      'inventing precision is an error, not a rounding difference')
  })

  test('a padded list is not a matched list', () => {
    // Recall alone would reward this; the both-directions check is what stops it.
    assert.ok(!same(['React'], ['React', 'Vue', 'Svelte', 'Angular'], 'technologies'))
  })

  test('provenance is not scored, because it describes the extractor', () => {
    const flat = flattenScalars({ company: 'Acme', source: { connector: 'web', confidence: 0.9 } }, 'experience/acme')
    assert.deepEqual([...flat.keys()], ['experience/acme.company'])
  })

  test('evidence has to show the value it supposedly supports', () => {
    const backs = { confidence: 0.7, section: 'Experience', text: 'Software Engineer at Google' }
    const elsewhere = { confidence: 0.7, section: 'Experience', text: 'Rebuilt the settlement pipeline' }

    assert.ok(supports('Google', backs, 'experience'))
    assert.ok(!supports('Google', elsewhere, 'experience'), 'the span does not mention it')
  })

  test('evidence has to come from a section that licenses the claim', () => {
    // The failure containment alone cannot catch: the word is right there, and it still does
    // not mean this person worked at Google.
    const following = { confidence: 0.7, section: 'Following', text: 'Follows Google on LinkedIn' }
    assert.ok(!supports('Google', following, 'experience'))
  })

  test('structured data is its own evidence', () => {
    assert.ok(supports('Google', { confidence: 1 }, 'experience'))
  })

  test('a value with no evidence at all is not supported', () => {
    assert.ok(!supports('Google', undefined, 'experience'))
    assert.ok(!supports('Google', {}, 'experience'))
  })

  test('a forbidden conclusion is scored as a violation', () => {
    const testCase = {
      slug: 't',
      expected: {
        url: 'https://x.test/',
        profile: { identity: { name: 'A B' } },
        forbidden: { experience: [{ company: 'Google' }] },
      },
    }

    const clean = scoreCase(testCase, { profile: { identity: { name: 'A B' } } })
    assert.equal(clean.traps[0].violated, false)

    const violating = scoreCase(testCase, {
      profile: { identity: { name: 'A B' }, experience: [{ company: 'Google LLC', role: 'Engineer' }] },
    })
    assert.equal(violating.traps[0].violated, true, 'a legal-suffix variant is the same claim')
  })

  test('invented fields are counted against precision but not against recall', () => {
    const testCase = { slug: 't', expected: { url: 'https://x.test/', profile: { identity: { name: 'A B' } } } }
    const summary = aggregate([scoreCase(testCase, {
      profile: { identity: { name: 'A B', headline: 'Invented Title' } },
    })])

    assert.equal(summary.recall, 1, 'everything expected was found')
    assert.ok(summary.precision < 1, 'but something was made up')
  })
})

describe('the baseline provider against the corpus', () => {
  test('meets the floors', async () => {
    const corpus = await loadCorpus()
    const summary = await runProvider(PROVIDERS[0], corpus)

    for (const [metric, floor] of Object.entries(FLOOR)) {
      assert.ok(
        summary[metric] >= floor,
        `${metric} was ${(summary[metric] * 100).toFixed(0)}%, below the ${(floor * 100).toFixed(0)}% floor. `
        + 'Run `npm run benchmark -- --misses` to see which fields moved.',
      )
    }
  })

  test('survives every negative case', async () => {
    // The one metric with no tolerance. A missing field is an inconvenience; concluding
    // someone worked at Google because the footer thanked Google Cloud is a fabricated CV,
    // and there is no recall figure that makes it acceptable.
    const corpus = await loadCorpus()
    const summary = await runProvider(PROVIDERS[0], corpus)

    assert.ok(summary.traps.total >= 15, 'the corpus needs a real supply of negative cases')
    assert.equal(summary.traps.violations, 0)
  })

  test('clears the gate that comes before recall', async () => {
    const summary = await runProvider(PROVIDERS[0], await loadCorpus())
    assert.deepEqual(gateFailures(summary), [])
  })

  test('still meets its recall floor on the pages it can actually see', async () => {
    // The corpus-wide figure now includes pages that are unreadable without a browser.
    // Measuring the static provider only against static pages is what keeps a regression in
    // the parser from hiding behind fixtures it was never going to read.
    const corpus = (await loadCorpus()).filter((c) => !c.expected.traits?.includes('javascript'))
    const summary = await runProvider(PROVIDERS[0], corpus)

    assert.ok(
      summary.recall >= STATIC_FLOOR.recall,
      `static recall was ${(summary.recall * 100).toFixed(0)}%, below the ${STATIC_FLOOR.recall * 100}% floor`,
    )
  })

  test('reads nothing from a fully client-rendered page, and that is the honest answer', async () => {
    const corpus = await loadCorpus()
    const spa = corpus.find((c) => c.slug === 'hydrated-profile')
    const signals = readSignals(parseHtml(spa.html))
    const { profile } = normalizeSignals(signals, { url: spa.expected.url })

    // Not a bug to be fixed here — it is the measurement that tells you what a renderer
    // would actually buy. An extractor that invented a plausible person from an empty shell
    // would be far worse than one that returns nothing.
    assert.ok(!profile.identity.name)
    assert.equal(profile.experience.length, 0)
  })
})
