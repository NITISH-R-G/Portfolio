/**
 * Crossref.
 *
 * The DOI registration agency's REST API is public and keyless — verified 2026-09-08 against
 * `api.crossref.org/works`. Where OpenAlex is a catalogue *about* published work, Crossref is
 * the registry that issued its identifiers, so it is the most authoritative source here for a
 * DOI, a publisher and a publication date.
 *
 * Filtered by ORCID, for the same reason OpenAlex is: a name query returns other people's
 * papers, and a portfolio that claims them is worse than one that lists none.
 *
 * @module connectors/crossref
 */

import { stamp, clean, count, some } from '../support.js'

const API = 'https://api.crossref.org/works'

/** @type {import('../types.js').Connector} */
const crossref = {
  id: 'crossref',
  name: 'Crossref',
  category: 'research',
  icon: 'BookOpen',
  availability: 'api',
  homepage: 'https://www.crossref.org',
  summary: 'DOI-registered publications with publisher, venue and date, matched to your ORCID.',
  limits:
    'Matched by ORCID, and only covers work that has a DOI registered with Crossref — ' +
    'preprints and theses often do not. Use it alongside OpenAlex rather than instead of it.',
  rateLimit: 'Public pool. Supplying a contact address joins the faster, more reliable pool.',
  supportedData: ['publications', 'socials'],
  fields: [
    { key: 'orcid', label: 'ORCID iD', required: true, placeholder: '0000-0002-1825-0097' },
    { key: 'mailto', label: 'Contact address', help: 'Optional. Crossref asks for one to use its faster pool. Sent to Crossref only, never published.' },
    { key: 'limit', label: 'Maximum publications', type: 'number' },
  ],

  identify: (cfg) => normaliseOrcid(cfg.orcid),
  profileUrl: (cfg) => {
    const id = normaliseOrcid(cfg.orcid)
    return id ? `https://orcid.org/${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const orcid = normaliseOrcid(cfg.orcid)
    if (!orcid) throw new Error('No ORCID iD configured. Crossref is matched by ORCID so that papers are certainly yours.')

    const params = new URLSearchParams({
      filter: `orcid:${orcid}`,
      rows: String(Math.min(Math.max(count(cfg.limit) ?? 50, 1), 100)),
      sort: 'published',
      order: 'desc',
    })
    const mailto = typeof cfg.mailto === 'string' ? cfg.mailto.trim() : ''
    if (mailto) params.set('mailto', mailto)

    return ctx.http.json(`${API}?${params}`, { platform: 'Crossref' })
  },

  normalize(raw, cfg, ctx) {
    const doc = /** @type {any} */ (raw) ?? {}
    const now = ctx.now
    const items = Array.isArray(doc?.message?.items) ? doc.message.items : []

    const publications = items
      .map((item) => {
        // Crossref titles are arrays; an item with none is a registration stub, not a paper.
        const title = Array.isArray(item?.title) ? item.title[0] : item?.title
        if (!title) return null
        const url = item?.DOI ? `https://doi.org/${item.DOI}` : item?.URL
        return clean({
          id: `crossref-${String(item.DOI ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
          title,
          year: yearOf(item),
          venue: Array.isArray(item['container-title']) ? item['container-title'][0] : undefined,
          publisher: item?.publisher || undefined,
          doi: item?.DOI || undefined,
          url,
          type: item?.type || undefined,
          citations: count(item['is-referenced-by-count']),
          authors: authorsOf(item),
          source: stamp('crossref', url, now),
        })
      })
      .filter(Boolean)

    const orcid = normaliseOrcid(cfg.orcid)

    return clean({
      publications: some(publications),
      socials: orcid ? { crossref: `https://search.crossref.org/search/works?q=${orcid}` } : undefined,
      meta: { connectors: ['crossref'] },
    })
  },
}

/** Crossref reports dates as nested part-arrays; the first part is the year. */
function yearOf(item) {
  for (const key of ['published-print', 'published-online', 'published', 'issued', 'created']) {
    const parts = item?.[key]?.['date-parts']
    const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined
    const value = count(year)
    if (value !== undefined) return value
  }
  return undefined
}

function authorsOf(item) {
  const list = Array.isArray(item?.author) ? item.author : []
  const names = list
    .map((a) => [a?.given, a?.family].filter(Boolean).join(' ').trim() || a?.name)
    .filter((name) => typeof name === 'string' && name)
    .slice(0, 12)
  return names.length ? names : undefined
}

function normaliseOrcid(value) {
  const match = /(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/.exec(String(value ?? '').trim())
  return match ? match[1].toUpperCase() : undefined
}

export default crossref
