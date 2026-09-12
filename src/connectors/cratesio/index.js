/**
 * crates.io.
 *
 * The Rust registry's API is public, documented and needs no key — verified 2026-09-08 against
 * `/api/v1/users/{login}` and `/api/v1/crates?user_id={id}`. Two requests get a user's whole
 * published output with download counts, which is unusually good for a package registry: PyPI,
 * by comparison, has no author search at all.
 *
 * crates.io asks that automated clients identify themselves with a real user agent, which the
 * shared HTTP client already does.
 *
 * @module connectors/cratesio
 */

import { stamp, clean, count, some, isoDay, skillWithEvidence } from '../support.js'

const API = 'https://crates.io/api/v1'

/** @type {import('../types.js').Connector} */
const cratesio = {
  id: 'cratesio',
  name: 'crates.io',
  category: 'packages',
  icon: 'Package',
  availability: 'api',
  homepage: 'https://crates.io',
  summary: 'Published Rust crates with descriptions, versions and download counts.',
  limits:
    'Public crates you own. crates.io identifies users by a numeric id, which this looks up ' +
    'from your login — the same login as the GitHub account the registry authenticates with.',
  rateLimit: 'crates.io asks automated clients to identify themselves and to fetch sparingly.',
  supportedData: ['packages', 'skills', 'stats', 'socials'],
  fields: [
    { key: 'username', label: 'crates.io login', required: true, placeholder: 'dtolnay', help: 'The GitHub login your crates.io account uses.' },
    { key: 'maxCrates', label: 'Maximum crates', type: 'number' },
  ],

  identify: (cfg) => (typeof cfg.username === 'string' && cfg.username.trim() ? cfg.username.trim() : undefined),
  profileUrl: (cfg) => {
    const user = typeof cfg.username === 'string' ? cfg.username.trim() : ''
    return user ? `https://crates.io/users/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const login = String(cfg.username ?? '').trim()
    if (!login) throw new Error('No crates.io login configured.')
    const opts = { platform: 'crates.io' }

    // The crate listing filters by numeric id, not by name, so the user has to be resolved
    // first. A wrong login fails here with a 404 rather than silently returning nothing.
    const user = /** @type {any} */ (await ctx.http.json(`${API}/users/${encodeURIComponent(login)}`, opts))
    const id = user?.user?.id
    if (id === undefined) throw new Error(`crates.io has no user "${login}".`)

    const perPage = Math.min(Math.max(count(cfg.maxCrates) ?? 50, 1), 100)
    const crates = await ctx.http.json(
      `${API}/crates?user_id=${encodeURIComponent(String(id))}&per_page=${perPage}&sort=downloads`,
      opts,
    )

    return { user: user.user, crates }
  },

  normalize(raw, _cfg, ctx) {
    const { user, crates } = /** @type {any} */ (raw) ?? {}
    const now = ctx.now
    const list = Array.isArray(crates?.crates) ? crates.crates : []

    const packages = list.map((crate) => {
      const url = `https://crates.io/crates/${crate.name}`
      return clean({
        id: `cratesio-${String(crate.name).toLowerCase()}`,
        name: crate.name,
        registry: 'crates.io',
        description: crate.description || undefined,
        version: crate.max_stable_version || crate.newest_version || crate.max_version || undefined,
        url,
        repository: typeof crate.repository === 'string' ? crate.repository : undefined,
        downloads: count(crate.downloads),
        downloadsPeriod: 'total',
        keywords: Array.isArray(crate.keywords) ? crate.keywords.filter((k) => typeof k === 'string') : undefined,
        updatedAt: isoDay(crate.updated_at),
        source: stamp('cratesio', url, now),
      })
    })

    const total = packages.reduce((sum, pkg) => sum + (pkg.downloads ?? 0), 0)

    const stats = packages.length && total > 0
      ? {
          entries: [{
            id: 'cratesio-downloads',
            label: 'Crate downloads',
            value: total,
            kind: /** @type {const} */ ('fetched'),
            note: `across ${packages.length} ${packages.length === 1 ? 'crate' : 'crates'}`,
            connectors: ['cratesio'],
          }],
        }
      : undefined

    const skills = packages.length
      ? [skillWithEvidence('Rust', {
          category: 'Languages',
          weight: packages.length,
          connector: 'cratesio',
          label: `${packages.length} published ${packages.length === 1 ? 'crate' : 'crates'}`,
          evidenceCount: packages.length,
          now,
        })]
      : []

    const profileUrl = user?.login ? `https://crates.io/users/${user.login}` : undefined

    return clean({
      packages: some(packages),
      skills: some(skills),
      stats,
      socials: profileUrl ? { cratesio: profileUrl } : undefined,
      meta: { connectors: ['cratesio'] },
    })
  },
}

export default cratesio
