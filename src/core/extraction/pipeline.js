/**
 * URL in, claims-ready extraction out.
 *
 * One function, and its whole job is to make the boundary impossible to route around:
 *
 *     fetch  →  signals  →  normalize  →  Extraction { profile fragment, evidence }
 *
 * There is deliberately no step after `normalize` here. A caller that wants a publishable
 * profile has to go through `collectClaims` and `resolveIdentity`, where the extraction gets
 * a confidence, competes with everything else the person has told us, and loses to their own
 * words. Adding a convenience function that returned a `Profile` would make the safe path the
 * longer one, and the shorter path would win.
 *
 * That matters most exactly when a provider is at its most impressive. A browser-rendered DOM
 * *looks* authoritative — it is what a human would see — and the temptation to trust it
 * directly is proportional to how good it looks. It is still a reading of someone's page by
 * a machine that has never met them.
 *
 * @module core/extraction/pipeline
 */

import { normalizeSignals } from './normalize.js'

/** @typedef {import('./types.js').ExtractionProvider} ExtractionProvider */
/** @typedef {import('./normalize.js').Extraction} Extraction */

/**
 * Run one provider over one URL.
 *
 * @param {ExtractionProvider} provider
 * @param {string} url
 * @param {import('./types.js').FetchContext & import('./types.js').ExtractContext} [context]
 * @returns {Promise<Extraction & {fetched: import('./types.js').FetchResult, timings: Record<string, number>}>}
 */
export async function extractFrom(provider, url, context = {}) {
  const started = now()

  const fetched = await provider.fetch(url, context)
  const fetchedAt = now()

  // A page that could not be retrieved yields an empty extraction with the reason attached,
  // never an exception. One unreachable URL in a batch of forty must not cost the other
  // thirty-nine, and the failure has to survive as data so it can be counted.
  if (fetched.failure) {
    return {
      profile: {},
      evidence: {},
      warnings: [fetched.failure],
      tiers: { exact: 0, strong: 0, moderate: 0, weak: 0 },
      fetched,
      timings: { fetchMs: fetchedAt - started, extractMs: 0, totalMs: fetchedAt - started },
    }
  }

  const signals = await provider.extract(fetched, { ...context, url: context.url ?? fetched.url ?? url })
  const extraction = normalizeSignals(signals, {
    // The *canonical* URL, not whatever host served the bytes. A fixture replayed from a
    // local server must resolve its relative links against the page's real address, or every
    // avatar and profile link comes out pointing at localhost.
    url: context.url ?? fetched.url ?? url,
    sourceId: context.sourceId ?? provider.id,
  })

  const done = now()
  return {
    ...extraction,
    fetched,
    timings: {
      fetchMs: fetchedAt - started,
      extractMs: done - fetchedAt,
      totalMs: done - started,
      ...(fetched.timings ?? {}),
    },
  }
}

const now = () => performance.now()
