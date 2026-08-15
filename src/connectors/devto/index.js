/**
 * DEV Community (dev.to).
 *
 * Official public REST API (https://developers.forem.com), no key required to list a
 * user's published articles, including reaction and comment counts and reading time.
 *
 * @module connectors/devto
 */

import { handle, stamp, clean, count, some } from '../support.js'

const API = 'https://dev.to/api'

/** @type {import('../types.js').Connector} */
const devto = {
  id: 'devto',
  name: 'DEV Community',
  category: 'writing',
  icon: 'Newspaper',
  availability: 'api',
  homepage: 'https://dev.to',
  summary: 'Published articles with tags, reactions and comment counts.',
  limits: 'Official public API, no key required for published articles.',
  supportedData: ['posts', 'skills', 'socials'],
  fields: [
    { key: 'username', label: 'DEV username', required: true },
    { key: 'limit', label: 'Maximum articles', type: 'number', help: 'Default 30.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user'], /dev\.to\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = devto.identify(cfg)
    return user ? `https://dev.to/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (devto.identify(cfg))
    const perPage = Math.min(Math.max(Number(cfg.limit) || 30, 1), 100)
    const articles = await ctx.http.json(
      `${API}/articles?username=${encodeURIComponent(username)}&per_page=${perPage}`,
      { platform: 'DEV' },
    )
    return { username, articles: Array.isArray(articles) ? articles : [] }
  },

  normalize(raw, _cfg, ctx) {
    const { username, articles } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://dev.to/${username}`

    const posts = articles
      .filter((article) => typeof article?.title === 'string')
      .map((article) => clean({
        id: `devto-${article.id ?? slug(article.title)}`,
        title: article.title,
        url: article.url,
        date: article.published_at ? String(article.published_at).slice(0, 10) : undefined,
        excerpt: article.description || undefined,
        tags: some(Array.isArray(article.tag_list) ? article.tag_list : undefined),
        reactions: count(article.public_reactions_count),
        comments: count(article.comments_count),
        publication: article.organization?.name,
        source: stamp('devto', article.url ?? profile, now),
      }))

    // A tag used across several articles is evidence of sustained work in that area, in a
    // way one post about a topic is not.
    /** @type {Map<string, number>} */
    const tags = new Map()
    for (const post of posts) {
      for (const tag of post.tags ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
    const skills = [...tags.entries()]
      .filter(([, n]) => n >= 3)
      .map(([tag, n]) => ({
        name: tag,
        weight: n,
        evidence: [{ label: `${n} articles written`, count: n, connector: 'devto', url: profile }],
        source: stamp('devto', profile, now),
      }))

    return clean({
      posts,
      skills: some(skills),
      socials: { devto: profile },
      meta: { connectors: ['devto'] },
    })
  },
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default devto
