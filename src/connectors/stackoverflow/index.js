/**
 * Stack Overflow, via the Stack Exchange API.
 *
 * An official, documented, versioned public API with a generous anonymous quota:
 * https://api.stackexchange.com/docs. A registered app key raises the daily quota but is
 * not required, so this works on a fresh clone.
 *
 * The API keys users by numeric id, not display name — the id is the number in your
 * profile URL. Pasting the whole URL works.
 *
 * @module connectors/stackoverflow
 */

import { stamp, clean, count, some, isoDay } from '../support.js'

const API = 'https://api.stackexchange.com/2.3'

/**
 * Read the numeric user id from config, accepting a bare id or a pasted profile URL.
 * @param {Record<string, unknown>} cfg
 */
function userId(cfg) {
  for (const key of ['userId', 'id', 'user']) {
    const raw = cfg?.[key]
    if (raw === undefined || raw === null) continue
    const value = String(raw).trim()
    if (!value) continue
    const fromUrl = /stackoverflow\.com\/users\/(\d+)/i.exec(value)
    if (fromUrl) return fromUrl[1]
    if (/^\d+$/.test(value)) return value
  }
  return undefined
}

/** @type {import('../types.js').Connector} */
const stackoverflow = {
  id: 'stackoverflow',
  name: 'Stack Overflow',
  category: 'community',
  icon: 'MessageSquare',
  availability: 'api',
  homepage: 'https://stackoverflow.com',
  summary: 'Reputation, badges, answer and question counts, and your highest-voted answers.',
  limits:
    'Official Stack Exchange API. The anonymous quota is 300 requests per day per IP, which ' +
    'this uses two of. Set STACKEXCHANGE_KEY in .env to raise it to 10,000.',
  supportedData: ['achievements', 'stats', 'socials'],
  authEnv: ['STACKEXCHANGE_KEY'],
  rateLimit: '300 requests/day per IP anonymously, 10,000 with a key.',
  fields: [
    {
      key: 'userId',
      label: 'Stack Overflow user id',
      required: true,
      placeholder: '22656',
      help: 'The number in your profile URL. Pasting the whole URL also works.',
    },
    { key: 'topAnswers', label: 'Highest-voted answers to show', type: 'number', help: 'Default 3. Set 0 to skip.' },
  ],

  identify: (cfg) => userId(cfg),
  profileUrl: (cfg) => {
    const id = userId(cfg)
    return id ? `https://stackoverflow.com/users/${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const id = /** @type {string} */ (userId(cfg))
    const key = ctx.env('STACKEXCHANGE_KEY')
    const query = `site=stackoverflow${key ? `&key=${encodeURIComponent(key)}` : ''}`
    const opts = { platform: 'Stack Overflow' }

    const users = /** @type {any} */ (await ctx.http.json(`${API}/users/${id}?${query}`, opts))
    const user = users?.items?.[0]
    if (!user) throw new Error(`Stack Overflow has no user with id ${id}.`)

    /** @type {string[]} */
    const warnings = []
    const wanted = cfg.topAnswers === undefined ? 3 : Math.max(0, Math.min(Number(cfg.topAnswers) || 0, 10))

    let answers = []
    if (wanted > 0) {
      try {
        const res = /** @type {any} */ (
          await ctx.http.json(
            `${API}/users/${id}/answers?order=desc&sort=votes&pagesize=${wanted}&${query}`,
            { ...opts, retries: 1 },
          )
        )
        answers = res?.items ?? []
      } catch {
        warnings.push('Top answers were unavailable.')
      }
    }

    if (users.quota_remaining !== undefined && users.quota_remaining < 20) {
      warnings.push(`Stack Exchange quota is nearly exhausted (${users.quota_remaining} left today).`)
    }

    return { id, user, answers, warnings }
  },

  normalize(raw, _cfg, ctx) {
    const { id, user, answers } = /** @type {any} */ (raw)
    const now = ctx.now
    const url = `https://stackoverflow.com/users/${id}`
    const badges = user?.badge_counts ?? {}

    const reputation = count(user?.reputation)

    // Badge counts are a compact, verifiable summary of standing, so they become one
    // achievement rather than three — three tiles of "1 gold badge" would read as padding.
    const badgeParts = [
      count(badges.gold) ? `${badges.gold} gold` : null,
      count(badges.silver) ? `${badges.silver} silver` : null,
      count(badges.bronze) ? `${badges.bronze} bronze` : null,
    ].filter(Boolean)

    const achievements = some([
      badgeParts.length && {
        id: 'stackoverflow-badges',
        title: `${badgeParts.join(', ')} badges`,
        organization: 'Stack Overflow',
        description: user?.answer_count
          ? `${user.answer_count} answers across ${user.question_count ?? 0} questions asked.`
          : undefined,
        url,
        source: stamp('stackoverflow', url, now),
      },
      ...(Array.isArray(answers) ? answers : [])
        .filter((answer) => answer?.answer_id)
        .map((answer) => clean({
          id: `stackoverflow-answer-${answer.answer_id}`,
          title: answer.title ? decodeEntities(answer.title) : `Answer #${answer.answer_id}`,
          organization: 'Stack Overflow',
          rank: answer.is_accepted ? 'Accepted answer' : undefined,
          date: isoDay(answer.creation_date),
          description: `${answer.score ?? 0} votes.`,
          url: answer.link ?? `https://stackoverflow.com/a/${answer.answer_id}`,
          source: stamp('stackoverflow', answer.link, now),
        })),
    ]) ?? []

    return clean({
      achievements,
      socials: { stackoverflow: url },
      stats: reputation !== undefined && reputation > 0
        ? { entries: [{ id: 'reputation', label: 'Reputation', value: reputation, kind: 'fetched', note: 'Stack Overflow', connectors: ['stackoverflow'] }] }
        : undefined,
      meta: { connectors: ['stackoverflow'] },
    })
  },
}

/** Stack Exchange returns question titles with HTML entities intact. */
function decodeEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export default stackoverflow
