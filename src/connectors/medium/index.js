/**
 * Medium.
 *
 * Medium's API is write-only (it can publish a post; it cannot read a profile), but every
 * Medium profile publishes an RSS feed, and a feed exists precisely to be read by
 * programs. That is the supported interface, so this connector uses it.
 *
 * What a feed cannot carry: claps, follower counts, and anything older than the most
 * recent posts. Those are absent rather than approximated.
 *
 * @module connectors/medium
 */

import { handle, stamp, clean, some } from '../support.js'
import { parseFeed } from '../feed.js'

/** @type {import('../types.js').Connector} */
const medium = {
  id: 'medium',
  name: 'Medium',
  category: 'writing',
  icon: 'Newspaper',
  availability: 'feed',
  homepage: 'https://medium.com',
  summary: 'Your recent articles, with tags, dates and excerpts.',
  limits:
    'Read from your public RSS feed, which carries roughly the ten most recent posts. Claps ' +
    'and follower counts are not in the feed and are not shown.',
  supportedData: ['posts', 'socials'],
  fields: [
    { key: 'username', label: 'Medium username', required: true, placeholder: '@yourname' },
    { key: 'publication', label: 'Publication name', help: 'Set this to read a publication feed instead of a personal one.' },
  ],

  identify: (cfg) =>
    handle(cfg, ['username', 'user'], /medium\.com\/@?([^/?#]+)/i)
    ?? handle(cfg, ['publication'], /medium\.com\/([^/?#]+)/i),

  profileUrl: (cfg) => {
    if (typeof cfg.publication === 'string' && cfg.publication.trim()) {
      return `https://medium.com/${cfg.publication.trim().replace(/^@/, '')}`
    }
    const user = handle(cfg, ['username', 'user'], /medium\.com\/@?([^/?#]+)/i)
    return user ? `https://medium.com/@${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const url = feedUrl(cfg)
    const xml = await ctx.http.text(url, { platform: 'Medium', headers: { accept: 'application/rss+xml, application/xml, text/xml' } })
    return { url, feed: parseFeed(xml, { limit: 30 }) }
  },

  normalize(raw, cfg, ctx) {
    const { feed } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = medium.profileUrl?.(cfg)

    const posts = (feed?.items ?? []).map((item) => clean({
      id: `medium-${slug(item.title)}`,
      title: item.title,
      url: item.url,
      date: item.date,
      excerpt: item.excerpt,
      tags: some(item.tags),
      publication: feed?.title && feed.title !== item.author ? feed.title : undefined,
      source: stamp('medium', item.url ?? profile, now),
    }))

    return clean({
      posts,
      socials: profile ? { medium: profile } : undefined,
      meta: { connectors: ['medium'] },
    })
  },
}

/** @param {Record<string, unknown>} cfg */
function feedUrl(cfg) {
  if (typeof cfg.feedUrl === 'string' && /^https?:/i.test(cfg.feedUrl)) return cfg.feedUrl
  if (typeof cfg.publication === 'string' && cfg.publication.trim()) {
    return `https://medium.com/feed/${cfg.publication.trim().replace(/^@/, '')}`
  }
  const user = handle(cfg, ['username', 'user'], /medium\.com\/@?([^/?#]+)/i)
  return `https://medium.com/feed/@${user}`
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default medium
