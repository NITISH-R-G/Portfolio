/**
 * The built-in provider: one HTTP GET and a parser.
 *
 * No browser, no service, no key, no per-page cost. It reads what the page already declares
 * about itself — JSON-LD, microdata, OpenGraph, headings, links — and nothing more.
 *
 * It exists to be the number every other provider has to beat. That framing matters: it is
 * easy to assume a rendering service is necessary and skip straight to paying for one, and
 * the assumption is worth testing, because the structured-data web is better than its
 * reputation. Sites built with Next.js, Astro, Hugo, Jekyll and every major CMS emit
 * schema.org by default; GitHub, ORCID and most academic profiles serve complete static
 * HTML. If the baseline recovers most of what a headless browser does, the browser is
 * infrastructure bought for the tail — a real decision, but one to make with the tail's
 * actual size in hand.
 *
 * Its honest limitation is equally worth measuring: a page that renders its content
 * client-side serves this provider an empty shell, and no amount of parsing recovers what
 * was never in the bytes. The benchmark's `javascript` metric is where that shows up.
 *
 * @module core/extraction/providers/builtin
 */

import { createHttpClient } from '../../../connectors/http.js'
import { parseHtml } from '../html.js'
import { readSignals } from '../signals.js'

/** @type {import('../types.js').ExtractionProvider} */
export const builtin = {
  id: 'builtin',
  name: 'Built-in',
  summary: 'Reads the structured data a page already publishes. No browser, no service, no key.',

  capabilities: {
    javascript: false,
    offline: true,
    authentication: 'none',
    authEnv: [],
    cost: 'free',
    limits: 'One request per page. Subject only to the site\'s own rate limiting.',
  },

  async fetch(url, ctx = {}) {
    const http = createHttpClient({
      ...(ctx.fetch ? { fetch: ctx.fetch } : {}),
      ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}),
    })

    try {
      const html = await http.text(url, {
        // Some sites serve a different document to clients that do not ask for HTML.
        headers: { accept: 'text/html,application/xhtml+xml' },
      })
      return { html, url, status: 200, rendered: false }
    } catch (err) {
      // A failed fetch is a measurement, not an exception: the benchmark's failure-rate
      // metric depends on unreachable pages being *reported* rather than thrown, so that one
      // dead URL does not abort a corpus run.
      return { html: '', url, failure: err?.message ?? 'The page could not be fetched.', rendered: false }
    }
  },

  async extract(fetched) {
    return readSignals(parseHtml(fetched.html ?? ''))
  },

  async health() {
    // Nothing to check. It has no dependency that can be down — which is itself a result
    // worth carrying into the comparison.
    return { state: 'ok', detail: 'No external dependency.' }
  },
}

export default builtin
