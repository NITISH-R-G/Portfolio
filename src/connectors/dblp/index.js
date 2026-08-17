/**
 * dblp.
 *
 * The computer-science bibliography's official search API, free and public, with a JSON
 * format. Coverage is narrower than Semantic Scholar's — CS venues only — but the metadata
 * is hand-curated and the venue names are correct, which matters on an academic portfolio.
 *
 * @module connectors/dblp
 */

import { handle, stamp, clean, some } from '../support.js'

const API = 'https://dblp.org/search/publ/api'

/** @type {import('../types.js').Connector} */
const dblp = {
  id: 'dblp',
  name: 'dblp',
  category: 'research',
  icon: 'BookOpen',
  availability: 'api',
  homepage: 'https://dblp.org',
  summary: 'Computer-science publications with accurate venue names and years.',
  limits:
    'Official public API, no key required. Covers computer science only, and matches by ' +
    'author name — a common name may need `pid` (your dblp person id) instead. dblp does ' +
    'not track citations.',
  supportedData: ['publications', 'socials'],
  fields: [
    { key: 'author', label: 'Author name as it appears on dblp', required: true, placeholder: 'Barbara Liskov' },
    { key: 'pid', label: 'dblp person id', help: 'e.g. "l/BarbaraLiskov". More precise than a name.' },
    { key: 'limit', label: 'Maximum publications', type: 'number', help: 'Default 60.' },
  ],

  identify: (cfg) =>
    handle(cfg, ['pid'], /dblp\.org\/pid\/(.+?)(?:\.html)?$/i)
    ?? (typeof cfg.author === 'string' && cfg.author.trim() ? cfg.author.trim() : undefined),
  profileUrl: (cfg) => {
    const pid = handle(cfg, ['pid'], /dblp\.org\/pid\/(.+?)(?:\.html)?$/i)
    return pid ? `https://dblp.org/pid/${pid}.html` : undefined
  },

  async fetch(cfg, ctx) {
    const pid = handle(cfg, ['pid'], /dblp\.org\/pid\/(.+?)(?:\.html)?$/i)
    const author = typeof cfg.author === 'string' ? cfg.author.trim() : ''
    const query = pid ? `pid:${pid}` : `author:${author.replace(/\s+/g, '_')}`
    const limit = Math.min(Math.max(Number(cfg.limit) || 60, 1), 200)

    const result = await ctx.http.json(
      `${API}?q=${encodeURIComponent(query)}&format=json&h=${limit}`,
      { platform: 'dblp' },
    )
    return { author, pid, result }
  },

  normalize(raw, _cfg, ctx) {
    const { author, pid, result } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = pid ? `https://dblp.org/pid/${pid}.html` : undefined

    // dblp returns a bare object rather than a one-element array for a single hit.
    const hits = result?.result?.hits?.hit
    const list = Array.isArray(hits) ? hits : hits ? [hits] : []

    const publications = list
      .map((entry) => entry?.info)
      .filter((info) => typeof info?.title === 'string' && info.title.trim())
      .map((info) => clean({
        id: `dblp-${slug(info.title)}`,
        title: info.title.replace(/\.$/, '').trim(),
        authors: authorsOf(info),
        venue: typeof info.venue === 'string' ? info.venue : undefined,
        type: entryType(info.type),
        date: info.year ? String(info.year) : undefined,
        doi: typeof info.doi === 'string' ? info.doi : undefined,
        url: typeof info.ee === 'string' && /^https?:/i.test(info.ee) ? info.ee : info.url,
        source: stamp('dblp', profile ?? 'https://dblp.org', now),
      }))

    return clean({
      publications,
      socials: profile ? { dblp: profile } : undefined,
      meta: { connectors: ['dblp'] },
    })
  },
}

/** dblp gives one author object for single-author papers and an array otherwise. */
function authorsOf(info) {
  const authors = info?.authors?.author
  const list = Array.isArray(authors) ? authors : authors ? [authors] : []
  return some(list.map((a) => (typeof a === 'string' ? a : a?.text)).filter(Boolean))
}

function entryType(type) {
  const value = String(type ?? '').toLowerCase()
  if (value.includes('journal')) return 'journal'
  if (value.includes('conference') || value.includes('inproceedings')) return 'conference'
  if (value.includes('informal')) return 'preprint'
  if (value.includes('book')) return 'chapter'
  return value ? 'other' : undefined
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default dblp
