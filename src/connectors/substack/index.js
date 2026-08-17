/**
 * Substack.
 *
 * Every Substack publication serves a public RSS feed at `/feed`. Subscriber counts are
 * not public and are not shown.
 *
 * @module connectors/substack
 */

import { handle, stamp, clean, some } from '../support.js'
import { parseFeed } from '../feed.js'

/** @type {import('../types.js').Connector} */
const substack = {
  id: 'substack',
  name: 'Substack',
  category: 'writing',
  icon: 'Newspaper',
  availability: 'feed',
  homepage: 'https://substack.com',
  summary: 'Recent posts from your newsletter, with dates and excerpts.',
  limits:
    'Read from the public RSS feed, which carries recent posts only. Subscriber counts are ' +
    'not public and are not shown. Paywalled posts appear as titles with truncated excerpts.',
  supportedData: ['posts', 'socials'],
  fields: [
    { key: 'publication', label: 'Substack subdomain or custom domain', required: true, placeholder: 'yourname' },
  ],

  identify: (cfg) => handle(cfg, ['publication', 'username', 'user'], /https?:\/\/([^/?#]+)/i),
  profileUrl: (cfg) => origin(cfg),

  async fetch(cfg, ctx) {
    const url = `${origin(cfg)}/feed`
    const xml = await ctx.http.text(url, { platform: 'Substack', headers: { accept: 'application/rss+xml, application/xml, text/xml' } })
    return { url, feed: parseFeed(xml, { limit: 30 }) }
  },

  normalize(raw, cfg, ctx) {
    const { feed } = /** @type {any} */ (raw)
    const now = ctx.now
    const home = origin(cfg)

    const posts = (feed?.items ?? []).map((item) => clean({
      id: `substack-${slug(item.title)}`,
      title: item.title,
      url: item.url,
      date: item.date,
      excerpt: item.excerpt,
      tags: some(item.tags),
      publication: feed?.title,
      source: stamp('substack', item.url ?? home, now),
    }))

    return clean({
      posts,
      socials: { substack: home },
      meta: { connectors: ['substack'] },
    })
  },
}

/**
 * A bare word is a Substack subdomain; anything with a dot is a custom domain the user has
 * pointed at Substack, and both are common.
 *
 * @param {Record<string, unknown>} cfg
 */
function origin(cfg) {
  const raw = String(cfg.publication ?? cfg.username ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(raw)) {
    try { return new URL(raw).origin } catch { /* fall through */ }
  }
  return raw.includes('.') ? `https://${raw}` : `https://${raw}.substack.com`
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default substack
