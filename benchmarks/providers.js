/**
 * The providers under test.
 *
 * One today. That is the point of the milestone: establish the baseline and the measuring
 * apparatus *before* evaluating anything with a price tag, so the question asked of a hosted
 * service is "what does this add over what we already have?" rather than "does this work?"
 * — a question every provider answers yes to.
 *
 * ## Adding one
 *
 * Implement `core/extraction/types.js`'s `ExtractionProvider` and list it here. Only
 * `extract` is exercised by the benchmark: fetching is replaced by the frozen fixture so
 * every provider sees identical bytes. A provider whose value *is* its fetching — a headless
 * renderer, say — therefore needs its fixtures captured post-render, which is exactly the
 * comparison worth making, and `--snapshot` writes whatever its own fetch returned.
 *
 * @module benchmarks/providers
 */

import { baseline } from '../src/core/extraction/providers/baseline.js'

/** @type {import('../src/core/extraction/types.js').ExtractionProvider[]} */
export const PROVIDERS = [baseline]

/** @param {string} id */
export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id)
}
