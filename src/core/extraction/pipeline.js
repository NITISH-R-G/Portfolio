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
import { assess } from './assess.js'
import { candidatesFor, connectorFor } from './registry.js'

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
    provider: provider.id,
    rendered: Boolean(fetched.rendered),
  })

  const done = now()
  return {
    ...extraction,
    signals,
    fetched,
    assessment: assess(extraction, signals),
    timings: {
      fetchMs: fetchedAt - started,
      extractMs: done - fetchedAt,
      totalMs: done - started,
      ...(fetched.timings ?? {}),
    },
  }
}

/**
 * Try the cheap provider; escalate only when it visibly came up short.
 *
 * The alternative — render everything — is what the Tier 1 measurement argues against.
 * Rendering costs roughly 200× the latency for +13 points of recall, and those points are
 * concentrated in a minority of pages. Someone connecting thirty sources should pay
 * milliseconds for the twenty-five that are ordinary HTML and 400 ms only for the five that
 * are single-page apps, rather than twelve seconds flat.
 *
 * Escalation is one step, not a search. Each provider is tried in registration order until
 * one produces an extraction that `assess` is satisfied with, and the last attempt is kept
 * if none does. It never returns *less* than the cheap attempt: a renderer that fails where
 * the parser succeeded loses, which keeps escalation strictly an improvement.
 *
 * A URL a connector already owns is refused outright. Extraction is the fallback branch, and
 * a browser is a worse way to read GitHub than GitHub's API.
 *
 * @param {string} url
 * @param {import('./types.js').FetchContext & import('./types.js').ExtractContext & {providers?: import('./types.js').ExtractionProvider[], force?: boolean}} [context]
 */
export async function extractUrl(url, context = {}) {
  const connector = connectorFor(url)
  if (connector && !context.force) {
    return {
      profile: {},
      evidence: {},
      warnings: [`${connector} already has a connector, which reads this far better than any extractor could.`],
      tiers: { exact: 0, strong: 0, moderate: 0, weak: 0 },
      connector,
      attempts: [],
    }
  }

  const chain = context.providers ?? candidatesFor(url)
  /** @type {any[]} */
  const attempts = []
  /** @type {any} */
  let best

  for (const provider of chain) {
    // A provider that cannot run here is skipped rather than failed. A missing browser binary
    // must degrade to "we did what we could", not to an error on a user's first connection.
    if (provider.health) {
      const health = await provider.health()
      if (health.state === 'unavailable') {
        attempts.push({ provider: provider.id, skipped: health.detail })
        continue
      }
    }

    const result = await extractFrom(provider, url, context)
    attempts.push({
      provider: provider.id,
      sufficient: result.assessment?.sufficient ?? false,
      reasons: result.assessment?.reasons ?? [],
      totalMs: result.timings?.totalMs ?? 0,
    })

    // Keep whichever attempt actually read more. Ordinarily that is the later one, but a
    // render that times out or hits a consent wall can return less than the static fetch did,
    // and escalating into a worse answer would be a strange way to spend 400ms.
    if (!best || weigh(result) > weigh(best)) best = result

    if (result.assessment?.sufficient) break
  }

  return { ...(best ?? { profile: {}, evidence: {}, warnings: ['Nothing could read this page.'], tiers: {} }), attempts }
}

/**
 * How much an extraction actually recovered.
 *
 * Counts evidenced values rather than fields, so a provider cannot win by emitting more
 * unsupported guesses — which is the same reason precision, not recall, leads the gate.
 *
 * @param {any} result
 */
function weigh(result) {
  return Object.keys(result?.evidence ?? {}).length
}

const now = () => performance.now()
