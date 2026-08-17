/**
 * GitLab.
 *
 * Official public REST API (v4), no token needed for public projects. Also works against
 * a self-hosted instance by setting `host`, which is the common case for people whose
 * GitLab work lives at their university or employer.
 *
 * @module connectors/gitlab
 */

import { handle, stamp, clean, count, some, isoDay, skillWithEvidence } from '../support.js'

/** @type {import('../types.js').Connector} */
const gitlab = {
  id: 'gitlab',
  name: 'GitLab',
  category: 'code',
  icon: 'GitBranch',
  availability: 'api',
  homepage: 'https://gitlab.com',
  summary: 'Public projects with stars, forks, topics and languages.',
  limits:
    'Public API, no token required for public projects. Set GITLAB_TOKEN in .env to include ' +
    'internal projects on a self-hosted instance.',
  supportedData: ['projects', 'skills', 'socials'],
  authEnv: ['GITLAB_TOKEN'],
  fields: [
    { key: 'username', label: 'GitLab username', required: true },
    { key: 'host', label: 'Instance URL', type: 'url', help: 'For self-hosted GitLab. Defaults to https://gitlab.com.' },
    { key: 'maxRepos', label: 'Maximum projects', type: 'number', help: 'Default 50.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user'], /gitlab\.[^/]+\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = gitlab.identify(cfg)
    return user ? `${host(cfg)}/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (gitlab.identify(cfg))
    const base = `${host(cfg)}/api/v4`
    const token = ctx.env('GITLAB_TOKEN')
    const opts = {
      platform: 'GitLab',
      headers: clean({ 'private-token': token || undefined }),
    }

    const users = /** @type {any} */ (
      await ctx.http.json(`${base}/users?username=${encodeURIComponent(username)}`, opts)
    )
    const user = Array.isArray(users) ? users[0] : undefined
    if (!user?.id) throw new Error(`GitLab has no user "${username}".`)

    const perPage = Math.min(Math.max(Number(cfg.maxRepos) || 50, 1), 100)
    const projects = /** @type {any} */ (
      await ctx.http.json(
        `${base}/users/${user.id}/projects?per_page=${perPage}&order_by=last_activity_at&visibility=public`,
        opts,
      )
    )

    return { username, host: host(cfg), user, projects: Array.isArray(projects) ? projects : [] }
  },

  normalize(raw, _cfg, ctx) {
    const { username, host: instance, user, projects } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `${instance}/${username}`

    const records = projects
      .filter((p) => p?.name && !p.archived)
      .map((p) => clean({
        id: `gitlab-${String(p.path ?? p.name).toLowerCase()}`,
        name: p.name,
        description: p.description || undefined,
        repository: p.web_url,
        stars: count(p.star_count),
        forks: count(p.forks_count),
        topics: some(Array.isArray(p.topics) ? p.topics : p.tag_list),
        technologies: some(Array.isArray(p.topics) ? p.topics : p.tag_list),
        date: isoDay(p.created_at),
        updatedAt: isoDay(p.last_activity_at),
        isFork: Boolean(p.forked_from_project),
        source: stamp('gitlab', p.web_url, now),
      }))

    /** @type {Map<string, number>} */
    const topics = new Map()
    for (const record of records) {
      for (const topic of record.topics ?? []) topics.set(topic, (topics.get(topic) ?? 0) + 1)
    }
    const skills = [...topics.entries()]
      .filter(([, n]) => n >= 2)
      .map(([topic, n]) => skillWithEvidence(topic, {
        weight: n,
        label: `${n} GitLab projects tagged`,
        evidenceCount: n,
        connector: 'gitlab',
        url: profile,
        now,
      }))

    return clean({
      projects: records,
      skills: some(skills),
      socials: { gitlab: profile },
      identity: user?.avatar_url ? { avatar: user.avatar_url } : undefined,
      meta: { connectors: ['gitlab'] },
    })
  },
}

/** @param {Record<string, unknown>} cfg */
function host(cfg) {
  const raw = typeof cfg.host === 'string' ? cfg.host.trim() : ''
  if (!raw) return 'https://gitlab.com'
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return new URL(candidate).origin
  } catch {
    return 'https://gitlab.com'
  }
}

export default gitlab
