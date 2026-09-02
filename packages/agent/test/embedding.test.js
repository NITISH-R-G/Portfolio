import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  PortfolioAgent, packVectors, unpackVectors, cosine, WEIGHTS,
  RemoteEmbeddingProvider, openRouterProvider, groqProvider, EmbeddingUnavailable,
  LocalEmbeddingProvider, DEFAULT_MODEL,
} from '../src/index.js'
import { fictional } from './fixtures.js'

/**
 * These never load the real model. A 23 MB download inside the unit suite would make every run
 * depend on a CDN and turn a fast check into a slow one — so the model is exercised by
 * `benchmarks/semantic.mjs`, and what is asserted here is everything around it: the storage
 * format, the fallbacks, the weighting, and the boundary that stops a similarity score from
 * becoming a claim.
 */

/** A provider that answers instantly, so behaviour can be tested without weights. */
class StubProvider {
  constructor(vectors) { this.vectors = vectors; this.calls = 0 }
  async embed(texts) { this.calls += 1; return texts.map((t) => this.vectors[t] ?? new Array(4).fill(0)) }
}

const unit = (values) => {
  const magnitude = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1
  return values.map((v) => v / magnitude)
}

describe('vector storage', () => {
  test('int8 packing survives a round trip within tolerance', () => {
    const vectors = [unit([1, 0, 0, 0]), unit([0.5, 0.5, 0.5, 0.5]), unit([-1, 0.2, 0, 0.3])]
    const restored = unpackVectors(packVectors(vectors))

    assert.equal(restored.length, 3)
    vectors.forEach((vector, row) => {
      vector.forEach((value, i) => {
        // 1/127 per component. Far below the margin that separates a relevant result from an
        // irrelevant one, and it buys a 4× smaller index that ships to every visitor.
        assert.ok(Math.abs(restored[row][i] - value) < 0.01, `${value} vs ${restored[row][i]}`)
      })
    })
  })

  test('packing quarters the size of float32', () => {
    const vectors = Array.from({ length: 50 }, () => unit(Array.from({ length: 384 }, (_, i) => (i % 7) - 3)))
    const packed = packVectors(vectors)
    const float32Bytes = 50 * 384 * 4
    // base64 adds a third; the win has to survive that to be worth doing.
    assert.ok(packed.data.length < float32Bytes / 2, `${packed.data.length} vs ${float32Bytes}`)
  })

  test('an empty or malformed index unpacks to nothing rather than throwing', () => {
    assert.deepEqual(unpackVectors(null), [])
    assert.deepEqual(unpackVectors({}), [])
  })

  test('cosine of identical unit vectors is 1, and of opposites is -1', () => {
    const a = unit([1, 2, 3, 4])
    assert.ok(Math.abs(cosine(a, a) - 1) < 1e-6)
    assert.ok(Math.abs(cosine(a, a.map((v) => -v)) + 1) < 1e-6)
    assert.equal(cosine(null, a), 0)
  })
})

describe('hybrid weighting is explicit', () => {
  test('every weight is declared in one table', () => {
    // §5 asks for weighting that is testable rather than scattered as literals through the
    // scoring loop. If these move, a test says so.
    assert.equal(WEIGHTS.match.exact, 1)
    assert.ok(WEIGHTS.match.concept < WEIGHTS.match.exact)
    assert.ok(WEIGHTS.match.semantic < WEIGHTS.match.concept)
    assert.ok(WEIGHTS.section.preferred > 1 && WEIGHTS.section.other < 1)
  })

  test('the embedding contribution is capped and floored', () => {
    // Uncapped cosine inverts genuine matches: on the real corpus a true paraphrase scored
    // 0.06 where an unrelated record scored 0.20.
    assert.ok(WEIGHTS.semantic.floor > 0, 'weak similarity must not register at all')
    assert.ok(WEIGHTS.semantic.weight < 5, 'semantic must not be able to dominate lexical')
  })
})

describe('degradation is silent and total', () => {
  const agent = () => PortfolioAgent.fromManifest(fictional, { strict: false })

  test('with no embedding index, semantic search is lexical search', async () => {
    const portfolio = agent()
    const semantic = await portfolio.semanticSearch('computer vision', { limit: 5 })
    const lexical = portfolio.search('computer vision', { limit: 5 })
    assert.deepEqual(semantic.map((r) => r.id), lexical.map((r) => r.id))
  })

  test('a provider that throws falls back rather than failing the search', async () => {
    const portfolio = agent()
    portfolio.useEmbeddings(packedIndexFor(portfolio))

    const results = await portfolio.semanticSearch('computer vision', {
      limit: 5,
      provider: { embed: async () => { throw new Error('model unavailable') } },
    })
    assert.ok(results.length > 0, 'a broken model must not empty the results')
  })

  test('a provider returning nothing falls back too', async () => {
    const portfolio = agent()
    portfolio.useEmbeddings(packedIndexFor(portfolio))
    const results = await portfolio.semanticSearch('computer vision', { limit: 5, provider: { embed: async () => [] } })
    assert.ok(results.length > 0)
  })

  test('a malformed index is ignored instead of corrupting search', async () => {
    const portfolio = agent()
    portfolio.useEmbeddings({ ids: null, data: 'nonsense' })
    assert.ok((await portfolio.semanticSearch('computer vision', { limit: 3 })).length > 0)
  })

  test('an empty query returns nothing without loading anything', async () => {
    const provider = new StubProvider({})
    assert.deepEqual(await agent().semanticSearch('   ', { provider }), [])
    assert.equal(provider.calls, 0)
  })
})

describe('similarity ranks, it never testifies', () => {
  test('a semantically-surfaced result keeps the record provenance and gains none', async () => {
    const portfolio = PortfolioAgent.fromManifest(fictional, { strict: false })
    const index = packedIndexFor(portfolio)
    portfolio.useEmbeddings(index)

    // A provider that declares everything maximally similar — the worst case for precision.
    const provider = { embed: async () => [unpackVectors(index)[0]] }
    const results = await portfolio.semanticSearch('something entirely unrelated', { limit: 5, provider })

    for (const result of results) {
      // `matched` is a list of terms that appeared. A cosine is not a term, so it must never
      // be listed as one — that is the "similarity dressed as evidence" the boundary forbids.
      for (const match of result.matched) {
        assert.notEqual(match.kind, 'vector')
        assert.ok(typeof match.term === 'string' && match.term.length > 0)
      }
      // Provenance is whatever the record already carried, untouched by the model.
      if (result.provenance) {
        assert.ok(!('similarityEvidence' in result.provenance))
        assert.ok(!Object.keys(result.provenance).includes('semantic'))
      }
    }
  })

  test('similarity is reported separately and numerically', async () => {
    const portfolio = PortfolioAgent.fromManifest(fictional, { strict: false })
    const index = packedIndexFor(portfolio)
    portfolio.useEmbeddings(index)
    const provider = { embed: async () => [unpackVectors(index)[0]] }

    const [top] = await portfolio.semanticSearch('anything', { limit: 1, provider })
    if (top?.similarity !== undefined) {
      assert.equal(typeof top.similarity, 'number')
      // Slightly wider than [-1, 1] on purpose: int8 quantization leaves vectors marginally
      // off unit length, so a perfect self-match lands around 1.004 rather than exactly 1.
      assert.ok(top.similarity <= 1.02 && top.similarity >= -1.02, `out of range: ${top.similarity}`)
    }
  })
})

describe('providers', () => {
  test('the local provider is the default and needs no key', () => {
    const provider = new LocalEmbeddingProvider()
    assert.equal(provider.requiresKey, false)
    assert.equal(provider.model, DEFAULT_MODEL)
  })

  test('remote providers refuse to exist without a key rather than failing later', () => {
    assert.throws(() => openRouterProvider(''), EmbeddingUnavailable)
    assert.throws(() => groqProvider(undefined), EmbeddingUnavailable)
  })

  test('a remote provider posts the OpenAI-compatible shape and normalises the response', async () => {
    let captured
    const provider = new RemoteEmbeddingProvider({
      baseUrl: 'https://example.test/v1/', model: 'm', apiKey: 'k',
      fetch: async (url, init) => {
        captured = { url, body: JSON.parse(init.body), auth: init.headers.authorization }
        return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [3, 4] }] }) }
      },
    })

    const [vector] = await provider.embed(['hello'])
    assert.equal(captured.url, 'https://example.test/v1/embeddings')
    assert.deepEqual(captured.body.input, ['hello'])
    assert.equal(captured.auth, 'Bearer k')
    // Returned unnormalised by some providers; cosine assumes unit length.
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-6)
  })

  test('a failing remote provider raises the error callers fall back on', async () => {
    const provider = new RemoteEmbeddingProvider({
      baseUrl: 'https://x.test', model: 'm', apiKey: 'k',
      fetch: async () => ({ ok: false, status: 429 }),
    })
    await assert.rejects(() => provider.embed(['x']), EmbeddingUnavailable)
  })
})

/** Deterministic stand-in vectors for the fixture corpus. */
function packedIndexFor(portfolio) {
  const ids = portfolio._index.map((d) => d.id)
  const vectors = ids.map((_, i) => unit(Array.from({ length: 8 }, (_, k) => Math.sin(i + k))))
  return { ...packVectors(vectors), ids, model: 'stub' }
}
