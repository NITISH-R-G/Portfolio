/**
 * arXiv.
 *
 * arXiv's export API returns Atom and needs no key — verified 2026-09-08 against
 * `export.arxiv.org/api/query`. It is the one source here that has preprints, which is most of
 * what a working researcher has that Crossref does not: a DOI is issued on publication, and
 * plenty of significant work never gets one.
 *
 * Matched by author name, which is the only thing arXiv indexes — it has no ORCID filter. That
 * makes this the one research connector that can return someone else's paper, so the limit says
 * so plainly and the query is quoted to keep it as tight as arXiv allows.
 *
 * arXiv asks for no more than one request every three seconds; this makes exactly one.
 *
 * @module connectors/arxiv
 */

import { stamp, clean, count, some, isoDay } from '../support.js'

const API = 'https://export.arxiv.org/api/query'

/** @type {import('../types.js').Connector} */
const arxiv = {
  id: 'arxiv',
  name: 'arXiv',
  category: 'research',
  icon: 'FileText',
  availability: 'api',
  homepage: 'https://arxiv.org',
  summary: 'Preprints and papers you have posted to arXiv, with abstracts and categories.',
  limits:
    'Matched by author name — arXiv indexes no ORCID, so a common name can return work that ' +
    'is not yours. Check the results, and remove anything that is not.',
  rateLimit: 'arXiv asks for at most one request every three seconds. This connector makes one.',
  supportedData: ['publications', 'socials'],
  fields: [
    { key: 'author', label: 'Author name', required: true, placeholder: 'Lovelace, Ada', help: 'As it appears on your papers. Surname first matches most reliably.' },
    { key: 'limit', label: 'Maximum papers', type: 'number' },
  ],

  identify: (cfg) => (typeof cfg.author === 'string' && cfg.author.trim() ? cfg.author.trim() : undefined),
  profileUrl: (cfg) => {
    const author = typeof cfg.author === 'string' ? cfg.author.trim() : ''
    return author ? `https://arxiv.org/a/${encodeURIComponent(author.toLowerCase().replace(/[^a-z]/g, ''))}` : undefined
  },

  async fetch(cfg, ctx) {
    const author = String(cfg.author ?? '').trim()
    if (!author) throw new Error('No arXiv author name configured.')

    const params = new URLSearchParams({
      // Quoted so arXiv treats it as a phrase; an unquoted two-word name matches either word
      // and returns a great deal that is not yours.
      search_query: `au:"${author}"`,
      max_results: String(Math.min(Math.max(count(cfg.limit) ?? 40, 1), 100)),
      sortBy: 'submittedDate',
      sortOrder: 'descending',
    })

    return ctx.http.text(`${API}?${params}`, { platform: 'arXiv' })
  },

  normalize(raw, cfg, ctx) {
    const xml = typeof raw === 'string' ? raw : ''
    const now = ctx.now

    const publications = entries(xml)
      .map((entry) => {
        const title = collapse(tag(entry, 'title'))
        const id = tag(entry, 'id')
        if (!title || !id) return null
        return clean({
          id: `arxiv-${id.split('/abs/').pop()?.replace(/[^\w.]+/g, '-')}`,
          title,
          year: yearOf(tag(entry, 'published')),
          date: isoDay(tag(entry, 'published')),
          venue: 'arXiv',
          url: id,
          doi: collapse(tag(entry, 'arxiv:doi')) || undefined,
          abstract: collapse(tag(entry, 'summary')) || undefined,
          type: 'preprint',
          authors: authorsOf(entry),
          source: stamp('arxiv', id, now),
        })
      })
      .filter(Boolean)

    const author = typeof cfg.author === 'string' ? cfg.author.trim() : ''

    return clean({
      publications: some(publications),
      socials: author
        ? { arxiv: `https://arxiv.org/a/${encodeURIComponent(author.toLowerCase().replace(/[^a-z]/g, ''))}` }
        : undefined,
      meta: { connectors: ['arxiv'] },
    })
  },
}

/**
 * Atom entries, split without a DOM.
 *
 * The engine has no XML parser and does not want one for a single feed shape; the existing
 * `feed.js` does the same thing for RSS. Non-greedy and anchored to the element, so a `<entry`
 * appearing inside an abstract cannot open a phantom record.
 */
function entries(xml) {
  return [...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1])
}

/**
 * The text of the first `<name>` element in a fragment.
 *
 * Written with `indexOf` rather than a constructed `RegExp`: building one from a template
 * string puts the escaping at the mercy of whatever wrote the file, and a `\\b` that silently
 * becomes `\b` produces a regex matching a literal backspace — which is exactly the bug this
 * replaced. It matched nothing and reported no error, so every paper was quietly dropped.
 *
 * @param {string} fragment
 * @param {string} name
 * @returns {string}
 */
function tag(fragment, name) {
  const open = `<${name}`
  let at = fragment.indexOf(open)
  while (at !== -1) {
    const after = fragment[at + open.length]
    // The next character must end the tag or begin an attribute, so `<id` cannot match
    // `<identifier`.
    if (after === '>' || after === ' ' || after === '\t' || after === '\n') {
      const start = fragment.indexOf('>', at)
      const end = fragment.indexOf(`</${name}>`, start)
      if (start === -1 || end === -1) return ''
      return decode(fragment.slice(start + 1, end).trim())
    }
    at = fragment.indexOf(open, at + 1)
  }
  return ''
}

function authorsOf(entry) {
  const names = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
    .map((m) => tag(m[1], 'name'))
    .filter(Boolean)
    .slice(0, 12)
  return names.length ? names : undefined
}

/** arXiv wraps titles and abstracts across lines; a portfolio wants one line. */
const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

function yearOf(value) {
  const year = Number(String(value ?? '').slice(0, 4))
  return Number.isFinite(year) && year > 1900 ? year : undefined
}

function decode(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export default arxiv
