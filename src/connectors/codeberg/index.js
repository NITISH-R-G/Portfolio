/**
 * Codeberg.
 *
 * Codeberg runs Forgejo, whose REST API is public, documented and needs no key for public
 * data — verified 2026-09-08 against `/api/v1/users/{user}` and `/api/v1/users/{user}/repos`.
 * That makes it the one alternative code host in this registry that imports as fully as GitHub
 * does, rather than contributing a link.
 *
 * The same shape works for any Forgejo or Gitea instance, so `host` is configurable. It
 * defaults to Codeberg because that is the one people mean.
 *
 * @module connectors/codeberg
 */

import { stamp, clean, count, some, isoDay, skillWithEvidence } from '../support.js'

const DEFAULT_HOST = 'https://codeberg.org'

/** @type {import('../types.js').Connector} */
const codeberg = {
  id: 'codeberg',
  name: 'Codeberg',
  category: 'code',
  icon: 'GitBranch',
  availability: 'api',
  homepage: 'https://codeberg.org',
  summary: 'Public repositories, languages and profile details from Codeberg.',
  limits:
    'Public repositories only. Forks are excluded unless you ask for them, and private ' +
    'repositories are never read — the API is called without a credential.',
  rateLimit: 'Codeberg asks for reasonable use; no documented anonymous quota.',
  supportedData: ['projects', 'skills', 'identity', 'socials'],
  fields: [
    { key: 'username', label: 'Codeberg username', required: true, placeholder: 'your-name' },
    { key: 'host', label: 'Instance URL', type: 'url', help: 'For a self-hosted Forgejo or Gitea. Defaults to codeberg.org.' },
    { key: 'includeForks', label: 'Include forks', type: 'boolean' },
    { key: 'maxRepos', label: 'Maximum repositories', type: 'number' },
  ],

  identify: (cfg) => (typeof cfg.username === 'string' && cfg.username.trim() ? cfg.username.trim() : undefined),
  profileUrl: (cfg) => {
    const user = typeof cfg.username === 'string' ? cfg.username.trim() : ''
    return user ? `${hostOf(cfg)}/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const user = String(cfg.username ?? '').trim()
    if (!user) throw new Error('No Codeberg username configured.')
    const host = hostOf(cfg)
    const api = `${host}/api/v1`
    const opts = { platform: 'Codeberg' }

    const profile = await ctx.http.json(`${api}/users/${encodeURIComponent(user)}`, opts)

    // Forgejo pages at 50; one page is plenty for a portfolio and keeps the request count at
    // two regardless of how prolific the account is.
    const limit = Math.min(Math.max(count(cfg.maxRepos) ?? 50, 1), 50)
    const repos = await ctx.http.json(
      `${api}/users/${encodeURIComponent(user)}/repos?limit=${limit}`,
      // Codeberg's repository listing is genuinely slow and highly variable — measured at
      // 24.6s, 12.2s and 3.1s on three consecutive calls, against the client's 15s default.
      // A default-timeout run therefore failed at random, which reads as "Codeberg is down"
      // rather than "Codeberg is slow". The user endpoint above answers in about 2s and keeps
      // the default.
      { ...opts, timeoutMs: 45_000 },
    )

    return { profile, repos, host }
  },

  normalize(raw, cfg, ctx) {
    const { profile, repos, host } = /** @type {any} */ (raw) ?? {}
    const now = ctx.now
    const includeForks = cfg.includeForks === true
    const base = host ?? hostOf(cfg)

    const projects = (Array.isArray(repos) ? repos : [])
      .filter((repo) => repo && !repo.private && (includeForks || !repo.fork))
      .map((repo) => clean({
        id: `codeberg-${String(repo.full_name ?? repo.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: repo.name,
        description: repo.description || undefined,
        repository: repo.html_url,
        liveUrl: typeof repo.website === 'string' && /^https?:/.test(repo.website) ? repo.website : undefined,
        stars: count(repo.stars_count),
        forks: count(repo.forks_count),
        technologies: repo.language ? [repo.language] : undefined,
        updatedAt: isoDay(repo.updated_at),
        source: stamp('codeberg', repo.html_url, now),
      }))
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))

    // One skill per language actually used, weighted by how many repositories use it — the
    // same evidence shape the other code hosts produce, so they merge rather than compete.
    /** @type {Map<string, number>} */
    const languages = new Map()
    for (const project of projects) {
      const language = project.technologies?.[0]
      if (language) languages.set(language, (languages.get(language) ?? 0) + 1)
    }

    const skills = [...languages.entries()].map(([name, n]) =>
      skillWithEvidence(name, {
        category: 'Languages',
        weight: n,
        connector: 'codeberg',
        label: `${n} Codeberg ${n === 1 ? 'repository' : 'repositories'}`,
        evidenceCount: n,
        now,
      }))

    const url = profile?.html_url ?? (profile?.login ? `${base}/${profile.login}` : undefined)

    return clean({
      identity: clean({
        name: profile?.full_name || undefined,
        summary: profile?.description || undefined,
        location: profile?.location || undefined,
        avatar: profile?.avatar_url || undefined,
        // Codeberg exposes `email` on the public profile only when the account chose to
        // publish it. It is deliberately not imported: an address a user made visible on one
        // platform is not consent to republish it on their portfolio, and the privacy layer
        // should never have to strip something that was never collected.
      }),
      projects: some(projects),
      skills: some(skills),
      socials: url ? { codeberg: url } : undefined,
      meta: { connectors: ['codeberg'] },
    })
  },
}

/** @param {Record<string, unknown>} cfg */
function hostOf(cfg) {
  const host = typeof cfg.host === 'string' ? cfg.host.trim().replace(/\/+$/, '') : ''
  return /^https?:\/\//.test(host) ? host : DEFAULT_HOST
}

export default codeberg
