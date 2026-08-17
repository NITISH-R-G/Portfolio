/**
 * ORCID.
 *
 * The official public API (pub.orcid.org), free, no registration, and the closest thing
 * research has to a canonical identifier. Works for anyone with an ORCID iD whose record
 * is public — which is the default.
 *
 * Prefer this over Google Scholar: it is authoritative, it is permitted, and it will not
 * break.
 *
 * @module connectors/orcid
 */

import { stamp, clean, count, some } from '../support.js'

const API = 'https://pub.orcid.org/v3.0'

/**
 * ORCID iDs are `0000-0002-1825-0097`, sometimes pasted as a full URL.
 * @param {Record<string, unknown>} cfg
 */
function orcidId(cfg) {
  for (const key of ['id', 'orcid', 'orcidId', 'username']) {
    const raw = cfg?.[key]
    if (typeof raw !== 'string') continue
    const match = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i.exec(raw.trim())
    if (match) return match[1].toUpperCase()
  }
  return undefined
}

/** @type {import('../types.js').Connector} */
const orcid = {
  id: 'orcid',
  name: 'ORCID',
  category: 'research',
  icon: 'BookOpen',
  availability: 'api',
  homepage: 'https://orcid.org',
  summary: 'Publications, preprints and other research works from your public ORCID record.',
  limits:
    'Official public API, no key required. ORCID records what you have added to them, so ' +
    'anything missing from your ORCID profile will be missing here. ORCID does not track ' +
    'citation counts — pair it with `semanticScholar` for those.',
  supportedData: ['publications', 'identity', 'socials'],
  fields: [
    { key: 'id', label: 'ORCID iD', required: true, placeholder: '0000-0002-1825-0097' },
    { key: 'limit', label: 'Maximum works', type: 'number', help: 'Default 100.' },
  ],

  identify: (cfg) => orcidId(cfg),
  profileUrl: (cfg) => {
    const id = orcidId(cfg)
    return id ? `https://orcid.org/${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const id = /** @type {string} */ (orcidId(cfg))
    const opts = { platform: 'ORCID', headers: { accept: 'application/json' } }

    const works = /** @type {any} */ (await ctx.http.json(`${API}/${id}/works`, opts))

    /** @type {string[]} */
    const warnings = []
    let person = null
    try {
      person = await ctx.http.json(`${API}/${id}/person`, { ...opts, retries: 1 })
    } catch {
      warnings.push('Name and biography were unavailable.')
    }

    return { id, works, person, warnings }
  },

  normalize(raw, cfg, ctx) {
    const { id, works, person } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://orcid.org/${id}`
    const limit = Math.min(Math.max(Number(cfg.limit) || 100, 1), 300)

    const publications = []
    for (const group of works?.group ?? []) {
      // ORCID groups duplicate records of the same work (one per contributing source).
      // The first summary in a group is the preferred one.
      const summary = group?.['work-summary']?.[0]
      if (!summary) continue
      const title = summary.title?.title?.value
      if (typeof title !== 'string' || !title.trim()) continue

      const ids = externalIds(group)
      publications.push(clean({
        id: `orcid-${slug(title)}`,
        title: title.trim(),
        venue: summary['journal-title']?.value || undefined,
        type: workType(summary.type),
        date: year(summary['publication-date']),
        doi: ids.doi,
        url: ids.url ?? (ids.doi ? `https://doi.org/${ids.doi}` : undefined),
        source: stamp('orcid', profile, now),
      }))
      if (publications.length >= limit) break
    }

    const givenName = person?.name?.['given-names']?.value
    const familyName = person?.name?.['family-name']?.value
    const identity = clean({
      name: some([givenName, familyName])?.join(' '),
      summary: person?.biography?.content || undefined,
    })

    return clean({
      publications,
      identity: Object.keys(identity).length ? identity : undefined,
      socials: { orcid: profile },
      meta: { connectors: ['orcid'] },
    })
  },
}

/** @param {any} group */
function externalIds(group) {
  /** @type {{doi?: string, url?: string}} */
  const out = {}
  const list = group?.['external-ids']?.['external-id']
    ?? group?.['work-summary']?.[0]?.['external-ids']?.['external-id']
    ?? []
  for (const entry of list) {
    const type = String(entry?.['external-id-type'] ?? '').toLowerCase()
    const value = entry?.['external-id-value']
    const url = entry?.['external-id-url']?.value
    if (type === 'doi' && typeof value === 'string') out.doi = value
    if (!out.url && typeof url === 'string' && /^https?:/i.test(url)) out.url = url
  }
  return out
}

/** ORCID's vocabulary is broad; the schema's is small. Anything unmapped becomes `other`. */
function workType(type) {
  const value = String(type ?? '').toLowerCase()
  if (value.includes('journal')) return 'journal'
  if (value.includes('conference')) return 'conference'
  if (value.includes('preprint')) return 'preprint'
  if (value.includes('dissertation') || value.includes('thesis')) return 'thesis'
  if (value.includes('chapter')) return 'chapter'
  return 'other'
}

/** @param {any} date */
function year(date) {
  const y = count(date?.year?.value)
  if (!y) return undefined
  const m = count(date?.month?.value)
  const d = count(date?.day?.value)
  if (m && d) return `${y}-${pad(m)}-${pad(d)}`
  if (m) return `${y}-${pad(m)}`
  return String(y)
}

const pad = (n) => String(n).padStart(2, '0')

const slug = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default orcid
