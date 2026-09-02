#!/usr/bin/env node
/**
 * `npm run embed` — precompute document embeddings.
 *
 * Every document in the portfolio is embedded once, here, on the machine doing the build. The
 * vectors ship with the site, so a visitor's browser only ever has to embed the thing it does
 * not already know: their query.
 *
 * That split is what makes local semantic search affordable. Embedding 120 documents in a
 * browser would mean 120 forward passes before the first result — several seconds on a laptop
 * and far worse on a phone, repeated for every visitor. Doing it at build time costs a few
 * hundred milliseconds once, and turns runtime into a single forward pass plus a dot product
 * against a 46 kB table.
 *
 * The output is written into the public manifest, so it travels with the portfolio and is
 * available to `@portfolio-engine/agent` consumers exactly as it is to the site.
 *
 * @module scripts/embed
 */

import { buildIndex } from '../packages/agent/src/search.js'
import {
  LocalEmbeddingProvider, packVectors, DEFAULT_MODEL,
  embeddingTextFor, fingerprintDocuments,
} from '../packages/agent/src/embedding.js'
import { toPublicManifest } from '../src/core/standard/public.js'
import { loadBuiltPortfolio, PATHS, relative, fs, path } from './lib/portfolio.mjs'
import { dim, ok, rule, say, warn } from './lib/ui.mjs'

async function main() {
  const built = await loadBuiltPortfolio({ onError: (m) => warn(m) })
  const manifest = toPublicManifest(built.profile, { config: built.config })
  const documents = buildIndex(manifest)

  if (!documents.length) {
    warn('Nothing to embed — the portfolio has no records yet.')
    return 0
  }

  say()
  rule('Embedding')
  say(dim(`  ${documents.length} documents · ${DEFAULT_MODEL} · runs locally, no API key`))

  const provider = new LocalEmbeddingProvider()

  const loadStart = performance.now()
  try {
    await provider.ready()
  } catch (error) {
    // A missing model is not a build failure. The site still works: search degrades to the
    // lexical path, which is exactly what happens for a visitor whose browser cannot load the
    // model either.
    warn(`${error.message}`)
    say(dim('  Skipping embeddings. Search will use lexical retrieval only.'))
    return 0
  }
  const loadMs = performance.now() - loadStart

  const embedStart = performance.now()
  const vectors = await provider.embed(documents.map(embeddingTextFor))
  const embedMs = performance.now() - embedStart

  const packed = packVectors(vectors)
  const index = {
    model: DEFAULT_MODEL,
    dimensions: packed.dimensions,
    count: packed.count,
    scale: packed.scale,
    // Ids, so a vector is bound to the document it describes rather than to a position that a
    // later change to the corpus would silently invalidate.
    ids: documents.map((document) => document.id),
    // Binds the vectors to the exact text they describe. The build refuses to use an index
    // whose fingerprint does not match the corpus it is about to ship, which is what stops a
    // rewritten description from being searched through its previous meaning.
    fingerprint: fingerprintDocuments(documents),
    data: packed.data,
    generatedAt: new Date().toISOString(),
  }

  fs.mkdirSync(PATHS.generated, { recursive: true })
  const file = path.join(PATHS.generated, 'embeddings.json')
  fs.writeFileSync(file, `${JSON.stringify(index)}\n`, 'utf8')

  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  ok(`${relative(file)} ${dim(`${kb} kB · ${packed.count}×${packed.dimensions} int8`)}`)
  say(dim(`  model load ${Math.round(loadMs)}ms · embedding ${Math.round(embedMs)}ms`))
  say()
  return 0
}

main().then((code) => process.exit(code ?? 0)).catch((error) => {
  warn(error?.message ?? String(error))
  process.exit(1)
})
