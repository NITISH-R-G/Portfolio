/**
 * Google Scholar.
 *
 * Scholar has no API, and its terms prohibit automated access to profile pages. This
 * project will not ship a scraper for it.
 *
 * There is a better route, and the connector says so: ORCID, Semantic Scholar and dblp all
 * publish free, official, public APIs covering the same publications, and this project has
 * working connectors for all three. Use one of those for the data and Scholar for the
 * link — most researchers already have all four identifiers.
 *
 * @module connectors/google-scholar
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'googleScholar',
  name: 'Google Scholar',
  category: 'research',
  icon: 'GraduationCap',
  homepage: 'https://scholar.google.com',
  summary: 'Profile link and citation figures, entered by you.',
  limits:
    'No automatic import. Google Scholar has no API and prohibits automated access. For ' +
    'publications that import themselves, enable the `orcid`, `semanticScholar` or `dblp` ' +
    'connector — all three are official, free and public, and cover the same work.',
  supportedData: ['publications', 'socials'],
  socialKey: 'googleScholar',
  urlFor: (id) => `https://scholar.google.com/citations?user=${id}`,
  urlPattern: /scholar\.google\.[a-z.]+\/citations\?(?:.*&)?user=([^&#]+)/i,
  fields: [
    { key: 'citations', label: 'Total citations', type: 'number' },
    { key: 'hIndex', label: 'h-index', type: 'number' },
    { key: 'i10Index', label: 'i10-index', type: 'number' },
  ],

  // Scholar's three headline numbers cannot be derived from imported publications when the
  // publications themselves are not imported, so they are accepted as stated figures and
  // shown with the profile link that backs them.
  extra: (cfg, source) => {
    const entries = [
      ['citations', 'Citations', cfg.citations],
      ['h-index', 'h-index', cfg.hIndex],
      ['i10-index', 'i10-index', cfg.i10Index],
    ]
      .map(([id, label, value]) => {
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric <= 0) return undefined
        return { id, label, value: numeric, kind: 'stated', note: 'Google Scholar', connectors: ['googleScholar'] }
      })
      .filter(Boolean)
    return entries.length ? { stats: { entries } } : undefined
  },
})
