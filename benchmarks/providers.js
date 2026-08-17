/**
 * The providers under test.
 *
 * Two, and the comparison between them is the entire point of the current milestone: they
 * share one extractor and differ only in whether a browser ran the page's JavaScript first.
 * Any score difference is therefore attributable to rendering and to nothing else — which is
 * only true because the Playwright provider deliberately does no parsing of its own.
 *
 * Ordered cheapest-first, matching `core/extraction/registry.js`. Registration order is the
 * escalation order, and it says something: a provider costing nothing and finishing in
 * milliseconds gets asked before one that starts Chromium.
 *
 * ## Adding one
 *
 * Implement `core/extraction/types.js`'s `ExtractionProvider` and list it here. Providers
 * that declare `capabilities.javascript` are given a real URL — the corpus is served from a
 * local HTTP server for the duration of the run — while the rest are handed the fixture bytes
 * directly. Both see the same page; only the retrieval differs.
 *
 * @module benchmarks/providers
 */

import { PROVIDERS as REAL, escalating } from '../src/core/extraction/providers/index.js'

/**
 * Under test: the two real providers, plus the escalation policy over them.
 *
 * The policy is scored as a peer deliberately. A routing rule that claims to deliver the
 * browser's recall at close to the parser's cost has to prove it against the same corpus, the
 * same ground truth and the same forbidden conclusions — otherwise "cheaper" is just a
 * quieter way of saying "worse".
 */
export const PROVIDERS = [...REAL, escalating]

/** @param {string} id */
export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id)
}

/**
 * Whether a provider can actually run here.
 *
 * Playwright's browser is a 150 MB download that lives outside the repository, so a fresh
 * checkout has the code but not the binary. That has to degrade to "skipped, and said so"
 * rather than a stack trace — a benchmark that cannot run on a clean machine is a benchmark
 * nobody runs.
 *
 * @param {import('../src/core/extraction/types.js').ExtractionProvider} provider
 * @returns {Promise<{ok: boolean, detail?: string}>}
 */
export async function available(provider) {
  if (!provider.health) return { ok: true }
  const health = await provider.health()
  return { ok: health.state === 'ok', detail: health.detail }
}
