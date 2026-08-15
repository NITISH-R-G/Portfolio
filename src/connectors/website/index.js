/**
 * Personal website.
 *
 * Reads any RSS, Atom or JSON Feed — every static-site generator emits one, so this covers
 * the blogs that live on the user's own domain rather than on a platform. It is also the
 * generic fallback for any platform with a feed but no dedicated connector here.
 *
 * @module connectors/website
 */

import { stamp, clean, some } from '../support.js'
import { parseFeed, excerpt, isoDate } from '../feed.js'

/** @type {import('../types.js').Connector} */
const website = {
  id: 'website',
  name: 'Personal website',
  category: 'writing',
  icon: 'Globe',
  availability: 'feed',
  homepage: '',
  summary: 'Posts from your own site\'s RSS, Atom or JSON feed.',
  limits:
    'Reads whatever your feed contains. If your site has no feed, most static-site ' +
    'generators can emit one with a single plugin.',
  supportedData: ['posts', 'socials'],
  fields: [
    { key: 'url', label: 'Website URL', type: 'url', required: true, placeholder: 'https://example.com' },
    {
      key: 'feedUrl',
      label: 'Feed URL',
      type: 'url',
      help: 'Optional. Guessed from the site URL when omitted (/feed.xml, /rss.xml, /feed, /index.xml, /feed.json).',
    },
  ],

  identify: (cfg) => {
    const url = siteUrl(cfg)
    if (!url) return undefined
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return undefined }
  },
  profileUrl: (cfg) => siteUrl(cfg),

  async fetch(cfg, ctx) {
    const site = siteUrl(cfg)
    const explicit = typeof cfg.feedUrl === 'string' && cfg.feedUrl.trim() ? cfg.feedUrl.trim() : ''

    // Static-site generators disagree about where the feed lives, and asking the user to
    // know which convention theirs uses is a worse experience than trying the five.
    const candidates = explicit
      ? [explicit]
      : ['/feed.xml', '/rss.xml', '/feed', '/index.xml', '/atom.xml', '/feed.json'].map((path) => join(site, path))

    /** @type {string[]} */
    const tried = []
    for (const candidate of candidates) {
      try {
        const body = await ctx.http.text(candidate, { platform: 'your website', retries: 0 })
        const parsed = candidate.endsWith('.json') ? parseJsonFeed(body) : parseFeed(body, { limit: 30 })
        if (parsed.items.length) return { site, feedUrl: candidate, feed: parsed }
        tried.push(`${candidate} (no entries)`)
      } catch (err) {
        tried.push(`${candidate} (${/** @type {Error} */ (err).message})`)
      }
    }

    throw new Error(
      `No readable feed found. Tried: ${tried.join('; ')}. Set \`feedUrl\` if your feed is elsewhere.`,
    )
  },

  normalize(raw, _cfg, ctx) {
    const { site, feed } = /** @type {any} */ (raw)
    const now = ctx.now

    const posts = (feed?.items ?? []).map((item) => clean({
      id: `site-${slug(item.title)}`,
      title: item.title,
      url: item.url,
      date: item.date,
      excerpt: item.excerpt,
      tags: some(item.tags),
      publication: feed?.title,
      source: stamp('website', item.url ?? site, now),
    }))

    return clean({
      posts,
      socials: site ? { website: site } : undefined,
      identity: site ? { contact: { website: site } } : undefined,
      meta: { connectors: ['website'] },
    })
  },
}

/** JSON Feed (jsonfeed.org) — used by a growing number of generators. */
function parseJsonFeed(body) {
  let doc
  try {
    doc = JSON.parse(body)
  } catch {
    return { items: [] }
  }
  const items = Array.isArray(doc?.items) ? doc.items : []
  return {
    title: typeof doc?.title === 'string' ? doc.title : undefined,
    items: items
      .filter((item) => typeof item?.title === 'string' && item.title.trim())
      .map((item) => clean({
        title: item.title.trim(),
        url: typeof item.url === 'string' && /^https?:/i.test(item.url) ? item.url : undefined,
        date: isoDate(item.date_published),
        excerpt: item.summary ? excerpt(item.summary) : excerpt(item.content_html ?? item.content_text),
        tags: Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === 'string') : undefined,
      })),
  }
}

/** @param {Record<string, unknown>} cfg */
function siteUrl(cfg) {
  const raw = typeof cfg.url === 'string' ? cfg.url.trim() : ''
  if (!raw) return undefined
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(candidate)
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return undefined
  }
}

/** @param {string|undefined} base @param {string} path */
function join(base, path) {
  if (!base) return path
  return `${base.replace(/\/$/, '')}${path}`
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default website
