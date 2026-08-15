/**
 * LeetCode.
 *
 * LeetCode publishes no documented REST API, but its site is a public GraphQL endpoint
 * that serves profile statistics for any public account without authentication — the same
 * request the profile page itself makes, against the same public data.
 *
 * That is a real interface rather than a scrape, but it is undocumented and unversioned,
 * so this connector treats a shape change as a warning and degrades to `partial` instead
 * of failing. The `limits` note tells the user that, because a connector that might stop
 * working is only acceptable if it says so.
 *
 * @module connectors/leetcode
 */

import { handle, stamp, clean, count, some, metric } from '../support.js'

const ENDPOINT = 'https://leetcode.com/graphql'

const QUERY = `query userProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile { ranking reputation }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
  userContestRanking(username: $username) {
    rating
    attendedContestsCount
    globalRanking
    topPercentage
  }
}`

/** @type {import('../types.js').Connector} */
const leetcode = {
  id: 'leetcode',
  name: 'LeetCode',
  category: 'competitive',
  icon: 'Code',
  availability: 'api',
  homepage: 'https://leetcode.com',
  summary: 'Problems solved by difficulty, contest rating, and global ranking.',
  limits:
    'Uses LeetCode\'s public GraphQL endpoint, which is undocumented and could change ' +
    'without notice. Requires the profile to be public. If it stops returning data the ' +
    'import reports a warning and the rest of your portfolio is unaffected.',
  supportedData: ['competitive', 'stats', 'socials'],
  fields: [
    { key: 'username', label: 'LeetCode username', required: true },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user', 'handle'], /leetcode\.com\/(?:u\/)?([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = leetcode.identify(cfg)
    return user ? `https://leetcode.com/u/${user}/` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (leetcode.identify(cfg))
    const body = await ctx.http.json(ENDPOINT, {
      method: 'POST',
      body: { query: QUERY, variables: { username } },
      headers: { referer: `https://leetcode.com/u/${username}/` },
      platform: 'LeetCode',
    })

    const data = /** @type {any} */ (body)?.data
    if (!data?.matchedUser) {
      throw new Error(`LeetCode has no public profile for "${username}", or the profile is private.`)
    }
    // A contest ranking is null for anyone who has never entered a contest — normal, not an error.
    return { username, ...data }
  },

  normalize(raw, _cfg, ctx) {
    const { username, matchedUser, userContestRanking } = /** @type {any} */ (raw)
    const now = ctx.now
    const url = `https://leetcode.com/u/${username}/`

    /** @type {Record<string, number>} */
    const breakdown = {}
    let total
    for (const item of matchedUser?.submitStatsGlobal?.acSubmissionNum ?? []) {
      const n = count(item?.count)
      if (n === undefined || typeof item?.difficulty !== 'string') continue
      if (item.difficulty === 'All') { total = n; continue }
      breakdown[item.difficulty.toLowerCase()] = n
    }
    // The "All" bucket is authoritative, but responses have omitted it before now, so fall
    // back to summing the difficulty buckets rather than reporting nothing.
    const summed = Object.values(breakdown).reduce((a, b) => a + b, 0)
    const problemsSolved = total ?? (summed > 0 ? summed : undefined)

    const rating = count(userContestRanking?.rating)
    const topPercentage = Number(userContestRanking?.topPercentage)

    const entry = clean({
      platform: 'LeetCode',
      connector: 'leetcode',
      username,
      url,
      // Contest rating is a float here; a portfolio shows it as a whole number.
      rating: rating !== undefined ? Math.round(rating) : undefined,
      globalRank: count(userContestRanking?.globalRanking) ?? count(matchedUser?.profile?.ranking),
      problemsSolved,
      contests: count(userContestRanking?.attendedContestsCount),
      breakdown: Object.keys(breakdown).length ? breakdown : undefined,
      metrics: some([
        Number.isFinite(topPercentage) && topPercentage > 0
          ? metric('Contest percentile', `Top ${topPercentage.toFixed(1)}%`)
          : undefined,
        metric('Reputation', count(matchedUser?.profile?.reputation)),
      ]),
      source: stamp('leetcode', url, now),
    })

    return {
      competitive: [entry],
      socials: { leetcode: url },
      meta: { connectors: ['leetcode'] },
    }
  },
}

export default leetcode
