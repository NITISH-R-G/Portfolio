/**
 * Docker Hub.
 *
 * Public registry API, no credential needed for public repositories. Pull counts are a
 * strong, verifiable signal for infrastructure and DevOps work, which otherwise leaves
 * very little visible trace on a portfolio.
 *
 * @module connectors/dockerhub
 */

import { handle, stamp, clean, count, some, isoDay } from '../support.js'

const API = 'https://hub.docker.com/v2'

/** @type {import('../types.js').Connector} */
const dockerhub = {
  id: 'dockerhub',
  name: 'Docker Hub',
  category: 'packages',
  icon: 'Package',
  availability: 'api',
  homepage: 'https://hub.docker.com',
  summary: 'Published images with pull and star counts.',
  limits: 'Public API, no credential required. Private repositories are never read.',
  supportedData: ['packages', 'skills', 'socials'],
  fields: [
    { key: 'username', label: 'Docker Hub username or organization', required: true },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user', 'namespace'], /hub\.docker\.com\/u\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = dockerhub.identify(cfg)
    return user ? `https://hub.docker.com/u/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const namespace = /** @type {string} */ (dockerhub.identify(cfg))
    const page = /** @type {any} */ (
      await ctx.http.json(
        `${API}/repositories/${encodeURIComponent(namespace)}/?page_size=100&ordering=-pull_count`,
        { platform: 'Docker Hub' },
      )
    )
    return { namespace, repos: Array.isArray(page?.results) ? page.results : [] }
  },

  normalize(raw, _cfg, ctx) {
    const { namespace, repos } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://hub.docker.com/u/${namespace}`

    const packages = repos
      .filter((repo) => repo?.name && repo.is_private !== true)
      .map((repo) => {
        const url = `https://hub.docker.com/r/${namespace}/${repo.name}`
        return clean({
          id: `docker-${String(repo.name).toLowerCase()}`,
          name: `${namespace}/${repo.name}`,
          registry: 'Docker Hub',
          description: repo.description || undefined,
          url,
          downloads: count(repo.pull_count),
          downloadsPeriod: 'total',
          updatedAt: isoDay(repo.last_updated),
          source: stamp('dockerhub', url, now),
        })
      })

    const skills = packages.length
      ? [{
          name: 'Docker',
          category: 'DevOps',
          weight: packages.length,
          evidence: [{ label: `${packages.length} published ${packages.length === 1 ? 'image' : 'images'}`, count: packages.length, connector: 'dockerhub', url: profile }],
          source: stamp('dockerhub', profile, now),
        }]
      : []

    return clean({
      packages,
      skills: some(skills),
      socials: { dockerhub: profile },
      meta: { connectors: ['dockerhub'] },
    })
  },
}

export default dockerhub
