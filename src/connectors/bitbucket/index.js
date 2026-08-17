/**
 * Bitbucket.
 *
 * Official public REST API (2.0), no credential needed for public repositories in a
 * workspace. Bitbucket has no stars, so ranking falls back to recency and description
 * quality — see `core/generate/scoring.js`, which already handles missing signals.
 *
 * @module connectors/bitbucket
 */

import { handle, stamp, clean, some, isoDay } from '../support.js'

const API = 'https://api.bitbucket.org/2.0'

/** @type {import('../types.js').Connector} */
const bitbucket = {
  id: 'bitbucket',
  name: 'Bitbucket',
  category: 'code',
  icon: 'GitBranch',
  availability: 'api',
  homepage: 'https://bitbucket.org',
  summary: 'Public repositories in your workspace, with languages and descriptions.',
  limits:
    'Public API. Bitbucket does not expose stars or forks for public repositories, so those ' +
    'figures are absent rather than guessed.',
  supportedData: ['projects', 'socials'],
  fields: [
    { key: 'workspace', label: 'Bitbucket workspace', required: true, help: 'Usually your username.' },
  ],

  identify: (cfg) => handle(cfg, ['workspace', 'username', 'user'], /bitbucket\.org\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const workspace = bitbucket.identify(cfg)
    return workspace ? `https://bitbucket.org/${workspace}/` : undefined
  },

  async fetch(cfg, ctx) {
    const workspace = /** @type {string} */ (bitbucket.identify(cfg))
    const page = /** @type {any} */ (
      await ctx.http.json(
        `${API}/repositories/${encodeURIComponent(workspace)}?pagelen=100&sort=-updated_on`,
        { platform: 'Bitbucket' },
      )
    )
    return { workspace, repos: Array.isArray(page?.values) ? page.values : [] }
  },

  normalize(raw, _cfg, ctx) {
    const { workspace, repos } = /** @type {any} */ (raw)
    const now = ctx.now

    const projects = repos
      .filter((repo) => repo?.name && repo.is_private !== true)
      .map((repo) => {
        const url = repo.links?.html?.href ?? `https://bitbucket.org/${workspace}/${repo.slug}`
        return clean({
          id: `bitbucket-${String(repo.slug ?? repo.name).toLowerCase()}`,
          name: repo.name,
          description: repo.description ? firstLine(repo.description) : undefined,
          repository: url,
          primaryLanguage: repo.language || undefined,
          technologies: some([repo.language]),
          date: isoDay(repo.created_on),
          updatedAt: isoDay(repo.updated_on),
          source: stamp('bitbucket', url, now),
        })
      })

    return {
      projects,
      socials: { bitbucket: `https://bitbucket.org/${workspace}/` },
      meta: { connectors: ['bitbucket'] },
    }
  },
}

/** Bitbucket descriptions are full Markdown READMEs often enough to be worth trimming. */
function firstLine(text) {
  const line = String(text).split('\n').map((l) => l.trim()).find(Boolean)
  if (!line) return undefined
  const clean = line.replace(/^#+\s*/, '')
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean
}

export default bitbucket
