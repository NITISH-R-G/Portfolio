/**
 * Codeforces.
 *
 * One of the few competitive-programming sites with a real, documented, public API that
 * needs no key: https://codeforces.com/apiHelp. Rating, rank and contest history import
 * exactly; problems solved is counted from the submission list, since the API reports
 * submissions rather than a solved total.
 *
 * @module connectors/codeforces
 */

import { handle, stamp, clean, count, some, metric } from '../support.js'

const API = 'https://codeforces.com/api'

/** @type {import('../types.js').Connector} */
const codeforces = {
  id: 'codeforces',
  name: 'Codeforces',
  category: 'competitive',
  icon: 'Trophy',
  availability: 'api',
  homepage: 'https://codeforces.com',
  summary: 'Rating, peak rating, rank, contests entered and distinct problems solved.',
  limits: 'Public API, no key required. Submission history is paged; the most recent 10,000 are counted.',
  supportedData: ['competitive', 'stats', 'socials'],
  fields: [
    { key: 'handle', label: 'Codeforces handle', required: true, placeholder: 'tourist' },
  ],

  identify: (cfg) => handle(cfg, ['handle', 'username', 'user'], /codeforces\.com\/profile\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = codeforces.identify(cfg)
    return user ? `https://codeforces.com/profile/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const user = /** @type {string} */ (codeforces.identify(cfg))
    const opts = { platform: 'Codeforces' }

    const info = /** @type {any} */ (
      await ctx.http.json(`${API}/user.info?handles=${encodeURIComponent(user)}`, opts)
    )
    // The API answers 200 with `{status: "FAILED"}` for a missing handle rather than 404,
    // so the body has to be checked or a typo would import as an empty profile.
    if (info?.status !== 'OK' || !info.result?.length) {
      throw new Error(info?.comment || `Codeforces has no user "${user}".`)
    }

    /** @type {string[]} */
    const warnings = []

    let rating = null
    try {
      const res = /** @type {any} */ (
        await ctx.http.json(`${API}/user.rating?handle=${encodeURIComponent(user)}`, { ...opts, retries: 1 })
      )
      if (res?.status === 'OK') rating = res.result
    } catch {
      warnings.push('Contest history was unavailable.')
    }

    let submissions = null
    try {
      const res = /** @type {any} */ (
        await ctx.http.json(
          `${API}/user.status?handle=${encodeURIComponent(user)}&from=1&count=10000`,
          { ...opts, retries: 1, timeoutMs: 30_000 },
        )
      )
      if (res?.status === 'OK') submissions = res.result
    } catch {
      warnings.push('Submission history was unavailable, so problems solved could not be counted.')
    }

    return { user, info: info.result[0], rating, submissions, warnings }
  },

  normalize(raw, _cfg, ctx) {
    const { user, info, rating, submissions } = /** @type {any} */ (raw)
    const now = ctx.now
    const url = `https://codeforces.com/profile/${user}`

    // A problem is identified by contest + index; the same problem solved twice, or solved
    // after failing, must count once.
    let problemsSolved
    if (Array.isArray(submissions)) {
      const solved = new Set()
      for (const submission of submissions) {
        if (submission?.verdict !== 'OK' || !submission.problem) continue
        const { contestId, index, name } = submission.problem
        solved.add(`${contestId ?? ''}-${index ?? ''}-${name ?? ''}`)
      }
      problemsSolved = solved.size
    }

    const entry = clean({
      platform: 'Codeforces',
      connector: 'codeforces',
      username: user,
      url,
      rating: count(info?.rating),
      maxRating: count(info?.maxRating),
      rank: typeof info?.rank === 'string' ? titleCase(info.rank) : undefined,
      maxRank: typeof info?.maxRank === 'string' ? titleCase(info.maxRank) : undefined,
      problemsSolved,
      contests: Array.isArray(rating) ? rating.length : undefined,
      metrics: some([
        metric('Contribution', count(info?.contribution)),
        metric('Friends', count(info?.friendOfCount)),
      ]),
      source: stamp('codeforces', url, now),
    })

    return {
      competitive: [entry],
      socials: { codeforces: url },
      meta: { connectors: ['codeforces'] },
    }
  },
}

/** The API returns ranks lower-cased ("legendary grandmaster"). */
function titleCase(value) {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export default codeforces
