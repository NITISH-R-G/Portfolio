/**
 * Which extraction provider handles a URL.
 *
 * The routing rule this project commits to, stated once so it cannot drift:
 *
 *     URL
 *      ├── a platform a connector already knows  →  the connector. Always.
 *      └── anything else                         →  an extraction provider
 *                                                     ├── the cheapest that can do the job
 *                                                     └── escalating only when it cannot
 *
 * Extraction is the **fallback branch**, not the universal path. Thirty connectors already
 * know exactly what to ask GitHub, ORCID and Hugging Face for, and routing those through a
 * browser would be slower, more fragile and less accurate than the API call they replace.
 * A generic extractor is what you reach for when nobody has written a connector — a personal
 * site, a university page, a portfolio nobody has seen before.
 *
 * @module core/extraction/registry
 */

import { detectSource } from '../sources/detect.js'

/** @typedef {import('./types.js').ExtractionProvider} ExtractionProvider */

/**
 * Providers, cheapest first.
 *
 * Order is the escalation order, and it is deliberate: a provider that costs nothing and
 * finishes in milliseconds should be asked before one that starts a browser. Registration
 * order is therefore a policy statement, not an implementation detail.
 *
 * @type {ExtractionProvider[]}
 */
const REGISTERED = []

/**
 * @param {ExtractionProvider} provider
 * @returns {ExtractionProvider}
 */
export function register(provider) {
  const existing = REGISTERED.findIndex((p) => p.id === provider.id)
  if (existing === -1) REGISTERED.push(provider)
  else REGISTERED[existing] = provider
  return provider
}

/** @returns {ExtractionProvider[]} */
export const providers = () => [...REGISTERED]

/** @param {string} id */
export const providerById = (id) => REGISTERED.find((p) => p.id === id)

/**
 * Whether a connector already owns this URL.
 *
 * When one does, extraction should not be involved at all — and saying so here, rather than
 * leaving it to each caller, is what stops "we have a browser now" from quietly becoming
 * "use the browser for everything".
 *
 * @param {string} url
 * @returns {string|undefined} The connector id, if any.
 */
export function connectorFor(url) {
  const detection = detectSource(url)
  return detection.outcome === 'matched' ? detection.connector : undefined
}

/**
 * The providers that could handle a URL, in escalation order.
 *
 * A provider with no `detect` claims everything — it is a general fallback. One that
 * declares `detect` is asked.
 *
 * @param {string} url
 * @returns {ExtractionProvider[]}
 */
export function candidatesFor(url) {
  return REGISTERED.filter((provider) => !provider.detect || provider.detect(url))
}
