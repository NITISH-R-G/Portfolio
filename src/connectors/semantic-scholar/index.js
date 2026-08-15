/**
 * Semantic Scholar.
 *
 * Official public Graph API (api.semanticscholar.org), free and documented, with an
 * optional key that raises the rate limit. This is the connector that supplies citation
 * counts and h-index legitimately — the numbers most researchers want and that Google
 * Scholar will not let anyone fetch.
 *
 * @module connectors/semantic-scholar
 */

import { stamp, clean, count, some } from '../support.js'

const API = 'https://api.semanticscholar.org/graph/v1'

/**
 * Requested explicitly rather than assembled, because the Graph API rejects the whole
 * request if one field name is wrong — a silent typo here would look like "this author has
 * no papers".
 */
const AUTHOR_FIELDS = [
  'name', 'hIndex', 'citationCount', 'paperCount', 'url',
  'papers.paperId', 'papers.title', 'papers.year', 'papers.venue',
  'papers.publicationTypes', 'papers.abstract', 'papers.citationCount',
  'papers.externalIds', 'papers.url', 'papers.authors',
].join(',')

/**
 * @param {Record<string, unknown>} cfg
 */
function authorId(cfg) {
  for (const key of ['authorId', 'id', 'username']) {
    const raw = cfg?.[key]
    if (raw === undefined || raw === null) continue
    const value = String(raw).trim()
    if (!value) continue
    const fromUrl = /semanticscholar\.org\/author\/(?:[^/]*\/)?(\d+)/i.exec(value)
    if (fromUrl) return fromUrl[1]
    if (/^\d+$/.test(value)) return value
  }
  return undefined
}

/** @type {import('../types.js').Connector} */
const semanticScholar = {
  id: 'semanticScholar',
  name: 'Semantic Scholar',
  category: 'research',
  icon: 'BookOpen',
  availability: 'api',
  homepage: 'https://www.semanticscholar.org',
  summary: 'Publications with citation counts, plus your h-index and total citations.',
  limits:
    'Official public API. The unauthenticated rate limit is shared across all users of the ' +
    'API, so an import may occasionally need a retry. Set SEMANTIC_SCHOLAR_KEY in .env for a ' +
    'dedicated limit (free, on request from the API team).',
  supportedData: ['publications', 'stats', 'socials'],
  authEnv: ['SEMANTIC_SCHOLAR_KEY'],
  rateLimit: 'Shared anonymous pool; a free key gives a dedicated limit.',
  fields: [
    {
      key: 'authorId',
      label: 'Semantic Scholar author id',
      required: true,
      placeholder: '1741101',
      help: 'The number in your author page URL. Pasting the whole URL also works.',
    },
    { key: 'limit', label: 'Maximum papers', type: 'number', help: 'Default 100.' },
  ],

  identify: (cfg) => authorId(cfg),
  profileUrl: (cfg) => {
    const id = authorId(cfg)
    return id ? `https://www.semanticscholar.org/author/${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const id = /** @type {string} */ (authorId(cfg))
    const key = ctx.env('SEMANTIC_SCHOLAR_KEY')
    const opts = {
      platform: 'Semantic Scholar',
      headers: clean({ 'x-api-key': key || undefined }),
      // The shared anonymous pool throttles aggressively; more patience here costs nothing
      // and turns a common transient failure into a success.
      retries: 3,
    }

    const author = await ctx.http.json(`${API}/author/${id}?fields=${encodeURIComponent(AUTHOR_FIELDS)}`, opts)
    return { id, author }
  },

  normalize(raw, cfg, ctx) {
    const { id, author } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = author?.url ?? `https://www.semanticscholar.org/author/${id}`
    const limit = Math.min(Math.max(Number(cfg.limit) || 100, 1), 300)

    const publications = (Array.isArray(author?.papers) ? author.papers : [])
      .filter((paper) => typeof paper?.title === 'string' && paper.title.trim())
      // Most-cited first: a researcher's strongest evidence should not depend on
      // whichever order the API happened to return.
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, limit)
      .map((paper) => clean({
        id: `s2-${paper.paperId ?? slug(paper.title)}`,
        title: paper.title.trim(),
        authors: some((paper.authors ?? []).map((a) => a?.name).filter((n) => typeof n === 'string')),
        venue: paper.venue || undefined,
        type: paperType(paper.publicationTypes),
        date: paper.year ? String(paper.year) : undefined,
        abstract: paper.abstract || undefined,
        doi: paper.externalIds?.DOI || undefined,
        url: paper.url || (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : undefined),
        citations: count(paper.citationCount),
        source: stamp('semanticScholar', profile, now),
      }))

    // h-index and citation totals are recomputed downstream from the publications actually
    // shown, so they always match what a reader can count for themselves. The author-level
    // figure is kept only when the record covers more work than was imported — otherwise it
    // would contradict the page it sits on.
    const reportedCitations = count(author?.citationCount)
    const totalPapers = count(author?.paperCount) ?? publications.length

    const entries = reportedCitations !== undefined && totalPapers > publications.length
      ? [{
          id: 'citations',
          label: 'Citations',
          value: reportedCitations,
          kind: 'fetched',
          note: `across ${totalPapers} publications`,
          connectors: ['semanticScholar'],
        }]
      : []

    return clean({
      publications,
      socials: { semanticScholar: profile },
      stats: entries.length ? { entries } : undefined,
      meta: { connectors: ['semanticScholar'] },
    })
  },
}

/** @param {unknown} types */
function paperType(types) {
  const list = Array.isArray(types) ? types.map((t) => String(t).toLowerCase()) : []
  if (list.includes('journalarticle')) return 'journal'
  if (list.includes('conference')) return 'conference'
  if (list.includes('thesis')) return 'thesis'
  if (list.includes('book') || list.includes('booksection')) return 'chapter'
  return list.length ? 'other' : undefined
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default semanticScholar
