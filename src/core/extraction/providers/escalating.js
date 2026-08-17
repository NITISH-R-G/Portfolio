/**
 * Cheap first; the browser only when the cheap attempt visibly came up short.
 *
 * Not a third extraction engine — a policy over the two that exist. It runs the built-in
 * provider, asks `assess` whether the result looks like a page that was actually read, and
 * escalates to Chromium only when it does not.
 *
 * The Tier 1 measurement is the whole argument. Rendering buys +13 points of recall and costs
 * roughly 200× the latency, and those points are concentrated in a minority of pages. Paying
 * 400 ms on every URL to fix one in three is a bad trade at scale: someone connecting thirty
 * sources should wait milliseconds for the twenty-five that are ordinary HTML.
 *
 * It is scored as its own provider in the benchmark for one reason — a routing policy that
 * *claims* to be as good as always-render has to be made to prove it against the same corpus,
 * the same ground truth and the same forbidden conclusions. A cheaper answer that quietly
 * loses recall is not a saving.
 *
 * @module core/extraction/providers/escalating
 */

import { builtin } from './builtin.js'
import { playwright } from './playwright.js'

/** @type {import('../types.js').ExtractionProvider & {chain: import('../types.js').ExtractionProvider[], escalates: true}} */
export const escalating = {
  id: 'escalating',
  name: 'Escalating',
  summary: 'Reads the page cheaply, and renders it only when the cheap read fell short.',

  /** Cheapest first. The order *is* the policy. */
  chain: [builtin, playwright],
  escalates: true,

  capabilities: {
    javascript: true,
    javascriptRendering: true,
    dynamicContent: true,
    screenshots: true,
    structuredExtraction: false,
    offline: false,
    authentication: 'none',
    authEnv: [],
    cost: 'free',
    limits: 'Renders only pages the static read could not handle.',
  },

  // Delegated wholesale. This provider owns *when* to render, never *how* to read — one
  // extractor across all of them is what keeps a score difference attributable to routing.
  async setup(options) { return playwright.setup(options) },
  async teardown() { return playwright.teardown() },
  async fetch(url, ctx) { return builtin.fetch(url, ctx) },
  async extract(fetched, ctx) { return builtin.extract(fetched, ctx) },
  async health() { return builtin.health() },
}

export default escalating
