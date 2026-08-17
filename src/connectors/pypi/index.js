/**
 * PyPI.
 *
 * PyPI's JSON API is official and public, but it is per-package: there is no supported
 * endpoint that lists everything an author has published, and the search page is HTML
 * meant for people. So this connector asks for package names rather than a username, and
 * says why.
 *
 * Download counts come from pypistats.org, the project the Python Packaging Authority
 * points at for exactly this — PyPI itself does not serve them.
 *
 * @module connectors/pypi
 */

import { stamp, clean, count, some, isoDay, list } from '../support.js'

const API = 'https://pypi.org/pypi'
const STATS = 'https://pypistats.org/api/packages'

/** @type {import('../types.js').Connector} */
const pypi = {
  id: 'pypi',
  name: 'PyPI',
  category: 'packages',
  icon: 'Package',
  availability: 'api',
  homepage: 'https://pypi.org',
  summary: 'Published Python packages with summaries, versions and recent download counts.',
  limits:
    'PyPI has no author-search API, so you list your package names. Download counts come ' +
    'from pypistats.org and cover the last month; a package with no data yet simply omits them.',
  supportedData: ['packages', 'skills', 'socials'],
  fields: [
    { key: 'packages', label: 'Package names', type: 'list', required: true, placeholder: 'requests, httpx' },
    { key: 'username', label: 'PyPI username', help: 'Used only to link to your profile page.' },
  ],

  identify: (cfg) => {
    const names = list(cfg.packages)
    if (names.length) return names.join(', ')
    return typeof cfg.username === 'string' && cfg.username.trim() ? cfg.username.trim() : undefined
  },
  profileUrl: (cfg) =>
    typeof cfg.username === 'string' && cfg.username.trim()
      ? `https://pypi.org/user/${cfg.username.trim()}/`
      : undefined,

  async fetch(cfg, ctx) {
    const names = list(cfg.packages)
    if (!names.length) throw new Error('No package names configured. PyPI cannot be searched by author.')

    const opts = { platform: 'PyPI' }
    /** @type {string[]} */
    const warnings = []
    const packages = []
    /** @type {Record<string, number>} */
    const downloads = {}

    for (const name of names.slice(0, 40)) {
      try {
        const doc = await ctx.http.json(`${API}/${encodeURIComponent(name)}/json`, { ...opts, retries: 1 })
        packages.push(doc)
      } catch (err) {
        // One bad name should not cost the user the rest of their packages.
        warnings.push(`"${name}": ${/** @type {Error} */ (err).message}`)
        continue
      }
      try {
        const stats = /** @type {any} */ (
          await ctx.http.json(`${STATS}/${encodeURIComponent(name.toLowerCase())}/recent`, { ...opts, retries: 0 })
        )
        const value = count(stats?.data?.last_month)
        if (value !== undefined) downloads[name.toLowerCase()] = value
      } catch {
        // pypistats is a separate service; treating its absence as fatal would be wrong.
      }
    }

    if (!packages.length) throw new Error(`None of the configured packages could be read from PyPI. ${warnings[0] ?? ''}`.trim())
    return { packages, downloads, warnings }
  },

  normalize(raw, _cfg, ctx) {
    const { packages, downloads } = /** @type {any} */ (raw)
    const now = ctx.now

    const records = (Array.isArray(packages) ? packages : [])
      .map((doc) => {
        const info = doc?.info
        if (!info?.name) return null
        const url = info.package_url ?? `https://pypi.org/project/${info.name}/`
        const key = String(info.name).toLowerCase()
        return clean({
          id: `pypi-${key}`,
          name: info.name,
          registry: 'PyPI',
          description: info.summary || undefined,
          version: info.version,
          url,
          repository: projectRepo(info),
          downloads: count(downloads?.[key]),
          downloadsPeriod: downloads?.[key] !== undefined ? 'last-month' : undefined,
          keywords: keywordsOf(info),
          updatedAt: latestRelease(doc),
          source: stamp('pypi', url, now),
        })
      })
      .filter(Boolean)
      .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))

    const skills = records.length
      ? [{
          name: 'Python',
          category: 'Languages',
          weight: records.length,
          evidence: [{ label: `${records.length} published PyPI ${records.length === 1 ? 'package' : 'packages'}`, count: records.length, connector: 'pypi' }],
          source: stamp('pypi', undefined, now),
        }]
      : []

    return clean({
      packages: records,
      skills: some(skills),
      meta: { connectors: ['pypi'] },
    })
  },
}

/** @param {any} info */
function keywordsOf(info) {
  const raw = info?.keywords
  if (Array.isArray(raw)) return raw.filter((k) => typeof k === 'string' && k.trim())
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean).slice(0, 10)
  }
  return undefined
}

/** PyPI scatters repository links across a free-form `project_urls` map. */
function projectRepo(info) {
  const urls = info?.project_urls
  if (urls && typeof urls === 'object') {
    for (const [label, value] of Object.entries(urls)) {
      if (typeof value !== 'string') continue
      if (/source|repository|github|code/i.test(label)) return value
    }
  }
  return typeof info?.home_page === 'string' && /^https?:/.test(info.home_page) ? info.home_page : undefined
}

/** The newest upload time across the latest version's files. */
function latestRelease(doc) {
  const files = doc?.urls
  if (!Array.isArray(files) || !files.length) return undefined
  const newest = files
    .map((f) => Date.parse(f?.upload_time_iso_8601 ?? f?.upload_time ?? ''))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0]
  return newest ? isoDay(new Date(newest).toISOString()) : undefined
}

export default pypi
