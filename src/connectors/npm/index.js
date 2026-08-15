/**
 * npm.
 *
 * Two official public APIs, no key: the registry's search endpoint finds everything a
 * maintainer publishes, and the downloads API reports usage. Download counts are the most
 * persuasive number an open-source developer has, and they are fetched rather than typed.
 *
 * @module connectors/npm
 */

import { handle, stamp, clean, count, some, isoDay, list } from '../support.js'

const REGISTRY = 'https://registry.npmjs.org'
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-month'

/** @type {import('../types.js').Connector} */
const npm = {
  id: 'npm',
  name: 'npm',
  category: 'packages',
  icon: 'Package',
  availability: 'api',
  homepage: 'https://www.npmjs.com',
  summary: 'Published packages with descriptions, versions and monthly download counts.',
  limits: 'Public registry API, no key required. Finds packages where you are listed as a maintainer.',
  supportedData: ['packages', 'skills', 'stats', 'socials'],
  fields: [
    { key: 'username', label: 'npm username', required: true, placeholder: 'sindresorhus' },
    { key: 'packages', label: 'Extra package names', type: 'list', help: 'Packages you publish under an org and are not a listed maintainer of.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user', 'maintainer'], /npmjs\.com\/~([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = npm.identify(cfg)
    return user ? `https://www.npmjs.com/~${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (npm.identify(cfg))
    const opts = { platform: 'npm' }

    const search = /** @type {any} */ (
      await ctx.http.json(
        `${REGISTRY}/-/v1/search?text=maintainer:${encodeURIComponent(username)}&size=250`,
        opts,
      )
    )

    const found = new Map()
    for (const object of search?.objects ?? []) {
      if (object?.package?.name) found.set(object.package.name, object.package)
    }

    /** @type {string[]} */
    const warnings = []

    for (const name of list(cfg.packages)) {
      if (found.has(name)) continue
      try {
        const doc = /** @type {any} */ (await ctx.http.json(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}`, { ...opts, retries: 1 }))
        const latest = doc?.['dist-tags']?.latest
        found.set(name, {
          name: doc?.name ?? name,
          description: doc?.description,
          version: latest,
          keywords: doc?.keywords,
          date: doc?.time?.[latest] ?? doc?.time?.modified,
          links: { npm: `https://www.npmjs.com/package/${doc?.name ?? name}`, repository: repoUrl(doc?.repository) },
        })
      } catch {
        warnings.push(`Package "${name}" could not be read from the registry.`)
      }
    }

    // One request per package. Capped so a prolific maintainer does not turn an import into
    // a two-minute wall of requests; packages are ordered by search score, so the cap drops
    // the least prominent.
    const names = [...found.keys()].slice(0, 40)
    /** @type {Record<string, number>} */
    const downloads = {}
    for (const name of names) {
      try {
        const point = /** @type {any} */ (
          await ctx.http.json(`${DOWNLOADS}/${encodeURIComponent(name).replace('%40', '@')}`, { ...opts, retries: 0 })
        )
        const value = count(point?.downloads)
        if (value !== undefined) downloads[name] = value
      } catch {
        // A package published in the last day has no download point yet. Not an error.
      }
    }
    if (found.size > names.length) {
      warnings.push(`Download counts were read for the first ${names.length} of ${found.size} packages.`)
    }

    return { username, packages: [...found.values()], downloads, warnings }
  },

  normalize(raw, _cfg, ctx) {
    const { username, packages, downloads } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://www.npmjs.com/~${username}`

    const records = (Array.isArray(packages) ? packages : [])
      .filter((pkg) => pkg?.name)
      .map((pkg) => {
        const url = pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`
        return clean({
          id: `npm-${pkg.name}`,
          name: pkg.name,
          registry: 'npm',
          description: pkg.description,
          version: pkg.version,
          url,
          repository: repoUrl(pkg.links?.repository),
          downloads: count(downloads?.[pkg.name]),
          downloadsPeriod: downloads?.[pkg.name] !== undefined ? 'last-month' : undefined,
          keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((k) => typeof k === 'string') : undefined,
          updatedAt: isoDay(pkg.date),
          source: stamp('npm', url, now),
        })
      })
      .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))

    // Publishing to npm is itself evidence of JavaScript or TypeScript, but claiming a
    // specific framework from a keyword would be inference, not evidence — so only the
    // ecosystem is asserted, and only when there is something published.
    const skills = records.length
      ? [{
          name: 'JavaScript',
          category: 'Languages',
          weight: records.length,
          evidence: [{ label: `${records.length} published npm ${records.length === 1 ? 'package' : 'packages'}`, count: records.length, connector: 'npm', url: profile }],
          source: stamp('npm', profile, now),
        }]
      : []

    return clean({
      packages: records,
      skills: some(skills),
      socials: { npm: profile },
      meta: { connectors: ['npm'] },
    })
  },
}

/**
 * The registry stores repository links as `git+https://…​.git`, `git://…` or a shorthand
 * like `github:user/repo`. Only a browsable https URL is useful on a portfolio.
 *
 * @param {unknown} value
 * @returns {string|undefined}
 */
function repoUrl(value) {
  const raw = typeof value === 'string' ? value : /** @type {any} */ (value)?.url
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  let url = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '')
  const shorthand = /^(github|gitlab|bitbucket):(.+)$/i.exec(url)
  if (shorthand) url = `https://${shorthand[1].toLowerCase()}.com/${shorthand[2]}`
  if (url.startsWith('git://')) url = `https://${url.slice(6)}`
  if (url.startsWith('git@')) url = `https://${url.slice(4).replace(':', '/')}`
  return /^https?:\/\//i.test(url) ? url : undefined
}

export default npm
