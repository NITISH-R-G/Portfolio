/**
 * Mastodon.
 *
 * Every Mastodon instance serves the same public REST API without authentication — verified
 * 2026-09-08 against `mastodon.social/api/v1/accounts/lookup`, which also returns an `ETag`,
 * so this participates in conditional fetching for free.
 *
 * Because Mastodon is federated, the instance is part of the address rather than a constant:
 * `@you@fosstodon.org` and `@you@mastodon.social` are different accounts.
 *
 * @module connectors/mastodon
 */

import { clean, count } from '../support.js'
import { excerpt } from '../feed.js'

/** @type {import('../types.js').Connector} */
const mastodon = {
  id: 'mastodon',
  name: 'Mastodon',
  category: 'social',
  icon: 'AtSign',
  availability: 'api',
  homepage: 'https://joinmastodon.org',
  summary: 'Display name, bio and follower counts from your Mastodon account.',
  limits:
    'Profile only, from whichever instance hosts you — Mastodon is federated, so the instance ' +
    'is part of your address. Posts are not imported.',
  supportedData: ['identity', 'stats', 'socials'],
  fields: [
    { key: 'handle', label: 'Full handle', required: true, placeholder: '@you@mastodon.social', help: 'Including the instance, since that is part of the address.' },
  ],

  identify: (cfg) => parseHandle(cfg)?.full,
  profileUrl: (cfg) => {
    const parsed = parseHandle(cfg)
    return parsed ? `https://${parsed.host}/@${parsed.user}` : undefined
  },

  async fetch(cfg, ctx) {
    const parsed = parseHandle(cfg)
    if (!parsed) throw new Error('No Mastodon handle configured. It needs the instance too, e.g. @you@mastodon.social.')
    return ctx.http.json(
      `https://${parsed.host}/api/v1/accounts/lookup?acct=${encodeURIComponent(parsed.user)}`,
      { platform: `Mastodon (${parsed.host})` },
    )
  },

  normalize(raw, cfg) {
    const account = /** @type {any} */ (raw) ?? {}
    const parsed = parseHandle(cfg)
    const url = account.url || (parsed ? `https://${parsed.host}/@${parsed.user}` : undefined)
    if (!url) return {}

    const followers = count(account.followers_count)

    return clean({
      identity: clean({
        name: account.display_name || undefined,
        // `note` is HTML; the shared helper strips tags rather than letting markup into a
        // field that is rendered as text.
        summary: account.note ? excerpt(account.note, 400) : undefined,
        avatar: account.avatar || undefined,
      }),
      stats: followers !== undefined
        ? { entries: [{ id: 'mastodon-followers', label: 'Mastodon followers', value: followers, kind: 'fetched', connectors: ['mastodon'] }] }
        : undefined,
      socials: { mastodon: url },
      meta: { connectors: ['mastodon'] },
    })
  },
}

/**
 * Split `@user@host` — or a profile URL — into its parts.
 *
 * @param {Record<string, unknown>} cfg
 * @returns {{user: string, host: string, full: string}|undefined}
 */
function parseHandle(cfg) {
  const raw = String(cfg?.handle ?? cfg?.profileUrl ?? '').trim()
  if (!raw) return undefined

  const fromUrl = /^https?:\/\/([^/]+)\/@([^/?#]+)/i.exec(raw)
  if (fromUrl) return { user: fromUrl[2], host: fromUrl[1], full: `@${fromUrl[2]}@${fromUrl[1]}` }

  const parts = raw.replace(/^@/, '').split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined
  return { user: parts[0], host: parts[1], full: `@${parts[0]}@${parts[1]}` }
}

export default mastodon
