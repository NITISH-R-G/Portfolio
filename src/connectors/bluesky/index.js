/**
 * Bluesky.
 *
 * The public AppView answers `app.bsky.actor.getProfile` without authentication — verified
 * 2026-09-08 against `public.api.bsky.app`. That makes Bluesky the one microblog in this
 * registry that can actually be read, which is why X next door is a link and this is not.
 *
 * Posts are deliberately not imported. A portfolio is not a timeline, and the feed endpoint
 * would pull in replies and reposts that say nothing about someone's work.
 *
 * @module connectors/bluesky
 */

import { clean, count } from '../support.js'

const API = 'https://public.api.bsky.app/xrpc'

/** @type {import('../types.js').Connector} */
const bluesky = {
  id: 'bluesky',
  name: 'Bluesky',
  category: 'social',
  icon: 'AtSign',
  availability: 'api',
  homepage: 'https://bsky.app',
  summary: 'Display name, bio, avatar and follower counts from your public Bluesky profile.',
  limits:
    'Profile only. Posts are not imported — a portfolio is not a timeline, and the feed ' +
    'endpoint returns replies and reposts alongside anything worth showing.',
  supportedData: ['identity', 'stats', 'socials'],
  fields: [
    { key: 'handle', label: 'Bluesky handle', required: true, placeholder: 'you.bsky.social' },
  ],

  identify: (cfg) => (typeof cfg.handle === 'string' && cfg.handle.trim() ? cfg.handle.trim().replace(/^@/, '') : undefined),
  profileUrl: (cfg) => {
    const handle = typeof cfg.handle === 'string' ? cfg.handle.trim().replace(/^@/, '') : ''
    return handle ? `https://bsky.app/profile/${handle}` : undefined
  },

  async fetch(cfg, ctx) {
    const handle = String(cfg.handle ?? '').trim().replace(/^@/, '')
    if (!handle) throw new Error('No Bluesky handle configured.')
    return ctx.http.json(
      `${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
      { platform: 'Bluesky' },
    )
  },

  // Neither the config nor the context is needed: the handle comes back in the response, and
  // the stats carry their attribution as `connectors` rather than a timestamped stamp.
  normalize(raw) {
    const profile = /** @type {any} */ (raw) ?? {}
    const handle = profile.handle
    if (!handle) return {}
    const url = `https://bsky.app/profile/${handle}`

    const followers = count(profile.followersCount)
    const posts = count(profile.postsCount)

    return clean({
      identity: clean({
        name: profile.displayName || undefined,
        summary: profile.description || undefined,
        avatar: profile.avatar || undefined,
      }),
      // `{entries: [...]}` with `kind: 'fetched'`, matching the schema and every other
      // connector: the shape is what `core/generate/stats.js` folds together, and `kind`
      // records that a platform reported this rather than the owner typing it.
      stats: statsOf([
        followers !== undefined ? { id: 'bluesky-followers', label: 'Bluesky followers', value: followers } : null,
        posts !== undefined ? { id: 'bluesky-posts', label: 'Bluesky posts', value: posts } : null,
      ]),
      socials: { bluesky: url },
      meta: { connectors: ['bluesky'] },
    })
  },
}

/** @param {({id: string, label: string, value: number}|null)[]} entries */
function statsOf(entries) {
  const kept = entries.filter(Boolean).map((entry) => ({ ...entry, kind: 'fetched', connectors: ['bluesky'] }))
  return kept.length ? { entries: kept } : undefined
}

export default bluesky
