/**
 * OpenAlex.
 *
 * An open catalogue of scholarly work, free and keyless — verified 2026-09-08 against
 * `api.openalex.org/works?filter=author.orcid:...`. It is the successor to Microsoft Academic
 * Graph and has broader coverage than any other free source here, which matters because the
 * research connectors already present each miss things: DBLP is computer science only,
 * Semantic Scholar wants a key for volume, and Google Scholar has no API at all.
 *
 * Filtered by ORCID rather than by name. A name search would silently attribute a stranger's
 * papers to the portfolio owner, which is the worst failure a research connector can have.
 *
 * OpenAlex asks that clients identify themselves with a contact address for the faster "polite
 * pool"; it is optional and used only if the owner provides one.
 *
 * @module connectors/openalex
 */

import { stamp, clean, count, some } from '../support.js'

const API = 'https://api.openalex.org'

/** @type {import('../types.js').Connector} */
const openalex = {
  id: 'openalex',
  name: 'OpenAlex',
  category: 'research',
  icon: 'BookOpen',
  availability: 'api',
  homepage: 'https://openalex.org',
  summary: 'Publications, venues and citation counts, matched to your ORCID.',
  limits:
    'Matched by ORCID only. Searching by name would attribute other people\'s papers to you, ' +
    'so an ORCID iD is required rather than optional.',
  rateLimit: '100,000 calls a day, 10 a second. Adding a contact address joins the faster pool.',
  supportedData: ['publications', 'stats', 'socials'],
  fields: [
    { key: 'orcid', label: 'ORCID iD', required: true, placeholder: '0000-0002-1825-0097' },
    { key: 'mailto', label: 'Contact address', help: 'Optional. OpenAlex asks for one to put you in its faster "polite pool". Sent to OpenAlex only, never published.' },
    { key: 'limit', label: 'Maximum publications', type: 'number' },
  ],

  identify: (cfg) => normaliseOrcid(cfg.orcid),
  profileUrl: (cfg) => {
    const id = normaliseOrcid(cfg.orcid)
    return id ? `https://openalex.org/works?filter=author.orcid:${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const orcid = normaliseOrcid(cfg.orcid)
    if (!orcid) throw new Error('No ORCID iD configured. OpenAlex is matched by ORCID so that papers are certainly yours.')

    const perPage = Math.min(Math.max(count(cfg.limit) ?? 50, 1), 200)
    const params = new URLSearchParams({
      filter: `author.orcid:${orcid}`,
      per_page: String(perPage),
      sort: 'cited_by_count:desc',
    })
    // Only when the owner supplied one. Never invented, and never their published address by
    // default — this is a request header's worth of courtesy, not a data field.
    const mailto = typeof cfg.mailto === 'string' ? cfg.mailto.trim() : ''
    if (mailto) params.set('mailto', mailto)

    return ctx.http.json(`${API}/works?${params}`, { platform: 'OpenAlex' })
  },

  normalize(raw, cfg, ctx) {
    const doc = /** @type {any} */ (raw) ?? {}
    const now = ctx.now
    const orcid = normaliseOrcid(cfg.orcid)
    const works = Array.isArray(doc.results) ? doc.results : []

    const publications = works
      .map((work) => {
        const title = work?.display_name || work?.title
        if (!title) return null
        const url = work?.doi || work?.id
        return clean({
          id: `openalex-${String(work.id ?? title).split('/').pop()}`,
          title,
          year: count(work.publication_year),
          venue: work?.primary_location?.source?.display_name || undefined,
          doi: typeof work.doi === 'string' ? work.doi.replace(/^https?:\/\/doi\.org\//, '') : undefined,
          url,
          citations: count(work.cited_by_count),
          type: work?.type || undefined,
          authors: authorsOf(work),
          source: stamp('openalex', url, now),
        })
      })
      .filter(Boolean)

    const citations = publications.reduce((sum, pub) => sum + (pub.citations ?? 0), 0)
    const total = count(doc?.meta?.count)

    const entries = []
    if (total !== undefined) {
      entries.push({ id: 'openalex-works', label: 'Publications', value: total, kind: 'fetched', connectors: ['openalex'] })
    }
    if (citations > 0) {
      entries.push({
        id: 'openalex-citations',
        label: 'Citations',
        value: citations,
        kind: 'fetched',
        note: `across ${publications.length} indexed ${publications.length === 1 ? 'work' : 'works'}`,
        connectors: ['openalex'],
      })
    }

    return clean({
      publications: some(publications),
      stats: entries.length ? { entries } : undefined,
      socials: orcid ? { openalex: `https://openalex.org/works?filter=author.orcid:${orcid}` } : undefined,
      meta: { connectors: ['openalex'] },
    })
  },
}

/** Accepts a bare iD or any orcid.org URL, and rejects anything that is not the real shape. */
function normaliseOrcid(value) {
  const raw = String(value ?? '').trim()
  const match = /(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/.exec(raw)
  return match ? match[1].toUpperCase() : undefined
}

/** @param {any} work */
function authorsOf(work) {
  const list = Array.isArray(work?.authorships) ? work.authorships : []
  const names = list
    .map((entry) => entry?.author?.display_name)
    .filter((name) => typeof name === 'string' && name)
    .slice(0, 12)
  return names.length ? names : undefined
}

export default openalex
