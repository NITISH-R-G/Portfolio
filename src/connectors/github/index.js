/**
 * GitHub.
 *
 * The richest connector in the set, and the one most users will rely on. The public REST
 * API needs no credential, which is what makes "clone, type your username, done" possible.
 *
 * A token is optional and only changes two things: the rate limit (60 requests/hour
 * unauthenticated, 5,000 authenticated) and access to the GraphQL API, which is the only
 * way to read pinned repositories and the contribution graph. Everything else works
 * without one, and the connector degrades to `partial` rather than failing when the extras
 * are unavailable.
 *
 * @module connectors/github
 */

import { handle, stamp, clean, count, isoDay, some, skillWithEvidence } from '../support.js'

const API = 'https://api.github.com'

/**
 * Whether a repository belongs on the portfolio at all.
 *
 * Used by both `fetch` and `normalize`, and that sharing is the point. The language
 * breakdown drives skill *evidence* — "Python — 3 repositories" — and if it were computed
 * over a different set of repositories than the ones actually rendered, the evidence would
 * contradict the page it appears on. A reader who counts the projects must arrive at the
 * same number.
 *
 * The profile README repo (always named after the user) is never a project, and neither is
 * an archived repository nobody starred.
 *
 * @param {Record<string, any>} repo
 * @param {string} username
 * @param {{includeForks: boolean, excluded: Set<string>}} options
 * @returns {boolean}
 */
function isPortfolioRepo(repo, username, options) {
  if (!repo?.name || repo.private) return false
  if (repo.fork && !options.includeForks) return false
  if (repo.archived && (repo.stargazers_count ?? 0) < 1) return false
  if (options.excluded.has(repo.name.toLowerCase())) return false
  if (repo.name.toLowerCase() === username.toLowerCase()) return false
  return true
}

/**
 * Read the repository names the user asked to skip, accepting an array or a comma-separated
 * string since both are natural to type.
 *
 * @param {unknown} value
 * @returns {Set<string>}
 */
function excludedNames(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  return new Set(raw.map((name) => String(name).trim().toLowerCase()).filter(Boolean))
}

/** @type {import('../types.js').Connector} */
const github = {
  id: 'github',
  name: 'GitHub',
  category: 'code',
  icon: 'Github',
  availability: 'api',
  homepage: 'https://github.com',
  summary: 'Repositories, languages, topics, stars and contribution activity.',
  limits:
    'Unauthenticated requests are limited to 60 per hour. Pinned repositories and the ' +
    'contribution graph are only available through the GraphQL API, which requires a token — ' +
    'without one those two extras are skipped and everything else still imports.',
  supportedData: ['projects', 'skills', 'stats', 'identity', 'socials'],
  authEnv: ['GITHUB_TOKEN'],
  rateLimit: '60 requests/hour unauthenticated, 5,000 with a token.',
  fields: [
    { key: 'username', label: 'GitHub username', required: true, placeholder: 'octocat' },
    { key: 'includeForks', label: 'Include forked repositories', type: 'boolean', help: 'Off by default — forks are rarely your own work.' },
    { key: 'maxRepos', label: 'Maximum repositories to import', type: 'number', help: 'Default 100.' },
    { key: 'exclude', label: 'Repositories to skip', type: 'list', help: 'Repository names, comma separated.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user', 'login'], /github\.com\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = github.identify(cfg)
    return user ? `https://github.com/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (github.identify(cfg))
    const token = ctx.env('GITHUB_TOKEN')
    const headers = clean({
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      authorization: token ? `Bearer ${token}` : undefined,
    })
    const opts = { headers, platform: 'GitHub' }

    /** @type {string[]} */
    const warnings = []

    const user = await ctx.http.json(`${API}/users/${encodeURIComponent(username)}`, opts)

    const maxRepos = Math.min(Math.max(Number(cfg.maxRepos) || 100, 1), 300)
    const repos = []
    // The API caps a page at 100, so more than that means paging. Sorted by last push so
    // that a cap truncates the least relevant work rather than an arbitrary slice.
    for (let page = 1; repos.length < maxRepos && page <= 3; page += 1) {
      const batch = /** @type {unknown[]} */ (
        await ctx.http.json(
          `${API}/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=pushed&type=owner`,
          opts,
        )
      )
      if (!Array.isArray(batch) || batch.length === 0) break
      repos.push(...batch)
      if (batch.length < 100) break
    }

    // Per-repo language breakdowns are one request each, which would blow the
    // unauthenticated budget on its own. Fetching the top slice by stars gives a
    // byte-weighted skill signal that is far better than counting primary languages,
    // without turning a 1-request import into a 100-request one.
    //
    // Filtered by the same rule `normalize` uses, so the skill evidence counts exactly the
    // repositories the portfolio shows.
    const options = { includeForks: cfg.includeForks === true, excluded: excludedNames(cfg.exclude) }
    const languageBudget = token ? 30 : 8
    const ranked = [...repos]
      .filter((repo) => isPortfolioRepo(repo, username, options))
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, languageBudget)

    /** @type {Record<string, Record<string, number>>} */
    const languages = {}
    for (const repo of ranked) {
      try {
        const bytes = await ctx.http.json(`${API}/repos/${repo.full_name}/languages`, {
          ...opts, retries: 0,
        })
        if (bytes && typeof bytes === 'object') languages[repo.full_name] = /** @type {Record<string, number>} */ (bytes)
      } catch (err) {
        // One missing breakdown is not worth failing the whole import over. Stop asking
        // once the budget is clearly exhausted rather than burning the rest of the run.
        warnings.push(`Language breakdown unavailable for ${repo.full_name}.`)
        if (/** @type {{status?: number}} */ (err).status === 403) break
      }
    }
    if (repos.length > ranked.length && ranked.length === languageBudget) {
      warnings.push(
        token
          ? `Language breakdowns were read for the top ${languageBudget} repositories.`
          : `Language breakdowns were read for the top ${languageBudget} repositories. Set GITHUB_TOKEN in .env to raise this.`,
      )
    }

    /** @type {unknown} */
    let graph = null
    if (token) {
      try {
        graph = await fetchGraphql(ctx, username, token)
      } catch (err) {
        warnings.push(`Pinned repositories and contribution totals were unavailable (${/** @type {Error} */ (err).message}).`)
      }
    } else {
      warnings.push('No GITHUB_TOKEN set, so pinned repositories and contribution totals were skipped.')
    }

    let orgs = []
    try {
      const raw = await ctx.http.json(`${API}/users/${encodeURIComponent(username)}/orgs`, { ...opts, retries: 0 })
      if (Array.isArray(raw)) orgs = raw
    } catch {
      // Organisation membership is public only when the member chose to make it so.
      // Its absence is normal, not an error.
    }

    return { username, user, repos, languages, graph, orgs, warnings }
  },

  normalize(raw, cfg, ctx) {
    const { username, user, repos, languages, graph, orgs } = /** @type {any} */ (raw)
    const now = ctx.now
    const profileUrl = `https://github.com/${username}`
    const options = { includeForks: cfg.includeForks === true, excluded: excludedNames(cfg.exclude) }

    const pinned = new Set(
      (graph?.data?.user?.pinnedItems?.nodes ?? [])
        .map((/** @type {{nameWithOwner?: string}} */ n) => n?.nameWithOwner)
        .filter(Boolean),
    )

    const projects = []
    for (const repo of Array.isArray(repos) ? repos : []) {
      if (!isPortfolioRepo(repo, username, options)) continue

      projects.push(clean({
        id: `github-${repo.name.toLowerCase()}`,
        name: humanize(repo.name),
        description: repo.description ?? undefined,
        repository: repo.html_url,
        liveUrl: normalizeHomepage(repo.homepage, repo.html_url),
        primaryLanguage: repo.language ?? undefined,
        technologies: some([
          repo.language,
          ...topicsOf(repo),
        ]),
        topics: some(topicsOf(repo)),
        stars: count(repo.stargazers_count),
        forks: count(repo.forks_count),
        watchers: count(repo.subscribers_count),
        date: isoDay(repo.created_at),
        updatedAt: isoDay(repo.pushed_at ?? repo.updated_at),
        isFork: Boolean(repo.fork),
        status: repo.archived ? 'archived' : undefined,
        // A pin is the owner's own statement that this is their best work. Nothing the
        // scoring heuristic computes should be able to outrank that.
        featured: pinned.has(repo.full_name) || undefined,
        source: stamp('github', repo.html_url, now),
      }))
    }

    /* Skills ---------------------------------------------------------------- */

    // Counted only over repositories that became projects. A skill saying "Python — 3
    // repositories" beside a page showing one Python project would be a number the reader
    // cannot verify, which is the failure mode this whole design exists to avoid.
    const rendered = new Set(projects.map((project) => project.id))

    /** @type {Map<string, {bytes: number, repos: number}>} */
    const byLanguage = new Map()
    for (const [fullName, bytes] of Object.entries(/** @type {Record<string, Record<string, number>>} */ (languages ?? {}))) {
      const repoName = fullName.split('/')[1]?.toLowerCase() ?? ''
      if (!rendered.has(`github-${repoName}`)) continue
      for (const [language, size] of Object.entries(bytes)) {
        const entry = byLanguage.get(language) ?? { bytes: 0, repos: 0 }
        entry.bytes += Number(size) || 0
        entry.repos += 1
        byLanguage.set(language, entry)
      }
    }
    // Repos outside the language-breakdown budget still count once, via their primary
    // language, so a long tail of small projects is not invisible.
    for (const project of projects) {
      const language = project.primaryLanguage
      if (!language || byLanguage.has(language)) continue
      byLanguage.set(language, { bytes: 0, repos: 1 })
    }

    const totalBytes = [...byLanguage.values()].reduce((a, b) => a + b.bytes, 0) || 1
    const skills = [...byLanguage.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes || b[1].repos - a[1].repos)
      .map(([language, { bytes, repos: repoCount }]) => skillWithEvidence(language, {
        category: 'Languages',
        // Share of code written, so a language used in one enormous repo does not read the
        // same as one used everywhere. Falls back to repo count when bytes are unknown.
        weight: bytes ? Math.round((bytes / totalBytes) * 100) : repoCount,
        label: `${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}`,
        evidenceCount: repoCount,
        connector: 'github',
        url: `${profileUrl}?tab=repositories`,
        now,
      }))

    // Topics are the author's own labels for their work — far better evidence for
    // frameworks and domains than anything inferred from a description.
    /** @type {Map<string, number>} */
    const topicCounts = new Map()
    for (const project of projects) {
      for (const topic of project.topics ?? []) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)
      }
    }
    for (const [topic, n] of topicCounts) {
      if (n < 2) continue
      skills.push(skillWithEvidence(topic, {
        weight: n,
        label: `${n} repositories tagged`,
        evidenceCount: n,
        connector: 'github',
        url: `${profileUrl}?tab=repositories`,
        now,
      }))
    }

    /* Stats ------------------------------------------------------------------ */

    const contributions = count(
      graph?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions,
    )
    const followers = count(user?.followers)

    const stats = { entries: some([
      contributions !== undefined && {
        id: 'contributions',
        label: 'Contributions',
        value: contributions,
        kind: 'fetched',
        note: 'in the last year',
        connectors: ['github'],
      },
      followers !== undefined && followers > 0 && {
        id: 'followers',
        label: 'GitHub followers',
        value: followers,
        kind: 'fetched',
        connectors: ['github'],
      },
    ]) ?? [] }

    /* Identity --------------------------------------------------------------- */

    const identity = clean({
      // `user.name` is a display name, not necessarily what the person wants at the top of
      // their portfolio, so config identity still wins — this is only the fallback.
      name: user?.name ?? undefined,
      summary: user?.bio ?? undefined,
      location: user?.location ?? undefined,
      avatar: user?.avatar_url ?? undefined,
      contact: user?.blog ? { website: absolute(user.blog) } : undefined,
    })

    const experience = (Array.isArray(orgs) ? orgs : [])
      .filter((org) => org?.login)
      .map((org) => clean({
        id: `github-org-${String(org.login).toLowerCase()}`,
        company: org.description || org.login,
        role: 'Member',
        links: [{ label: org.login, url: `https://github.com/${org.login}` }],
        source: stamp('github', `https://github.com/${org.login}`, now),
      }))

    return clean({
      identity: Object.keys(identity).length ? identity : undefined,
      socials: { github: profileUrl },
      projects,
      skills,
      stats,
      // Organisation membership is real, verifiable affiliation, but it is not a job. It
      // is offered as experience only when the user asks for it, so nobody's portfolio
      // silently claims employment.
      ...(cfg.includeOrganizations === true && experience.length ? { experience } : {}),
      meta: { connectors: ['github'] },
    })
  },
}

/**
 * Pinned repositories and the contribution calendar, neither of which the REST API
 * exposes. Requires a token; the caller treats failure here as a warning, not an error.
 *
 * @param {import('../types.js').ConnectorContext} ctx
 * @param {string} username
 * @param {string} token
 */
async function fetchGraphql(ctx, username, token) {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection { contributionCalendar { totalContributions } }
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes { ... on Repository { nameWithOwner } }
      }
    }
  }`
  return ctx.http.json('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { query, variables: { login: username } },
    platform: 'GitHub',
    retries: 0,
  })
}

/** @param {{topics?: string[]}} repo */
function topicsOf(repo) {
  return Array.isArray(repo.topics) ? repo.topics.filter((t) => typeof t === 'string') : []
}

/**
 * `some-cool-project` → `Some Cool Project`, but `WebRTC-demo` keeps its capitals — an
 * acronym the author typed deliberately should not be flattened.
 *
 * @param {string} name
 * @returns {string}
 */
function humanize(name) {
  return name
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => (/[A-Z]/.test(word.slice(1)) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

/**
 * GitHub's `homepage` field is free text and frequently holds a bare domain, an empty
 * string, or the repository's own URL. Only a real, different destination is a live demo.
 *
 * @param {unknown} homepage
 * @param {string} repoUrl
 */
function normalizeHomepage(homepage, repoUrl) {
  const url = absolute(homepage)
  if (!url || url.replace(/\/$/, '') === repoUrl.replace(/\/$/, '')) return undefined
  return url
}

/** @param {unknown} value */
function absolute(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  try {
    return new URL(candidate).href
  } catch {
    return undefined
  }
}

export default github
