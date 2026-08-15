/**
 * HackerRank.
 *
 * HackerRank publishes no public profile API. The endpoints its own site calls are
 * undocumented, unversioned and behind bot protection, so building on them would produce
 * an integration that breaks without warning.
 *
 * Badges, certifications and skill scores are therefore typed by the user and attributed
 * to HackerRank, with a link to the profile that proves them. `data.certifications`
 * entries with a `credentialUrl` are the strongest form of this: the claim is manual, the
 * verification is not.
 *
 * @module connectors/hackerrank
 */

import { defineManualConnector, list } from '../manual.js'

export default defineManualConnector({
  id: 'hackerrank',
  name: 'HackerRank',
  category: 'competitive',
  icon: 'Trophy',
  homepage: 'https://www.hackerrank.com',
  summary: 'Badges, skill certifications and contest results, entered by you and linked to your profile.',
  limits:
    'No automatic import. HackerRank has no public profile API. Enter badges and ' +
    'certifications here — add a `credentialUrl` to each certification so readers can verify it.',
  supportedData: ['certifications', 'achievements', 'competitive', 'socials'],
  competitive: true,
  urlFor: (username) => `https://www.hackerrank.com/profile/${username}`,
  urlPattern: /hackerrank\.com\/(?:profile\/)?([^/?#]+)/i,
  fields: [
    { key: 'badges', label: 'Badges', type: 'list', help: 'e.g. "SQL (Gold)", "Problem Solving (Silver)".' },
  ],

  // Badges read naturally as a flat list in config, but they are achievements in the
  // schema. Expanding them here keeps the config human and the data uniform.
  extra: (cfg, source) => {
    const badges = list(cfg.badges)
    if (!badges.length) return undefined
    return {
      achievements: badges.map((badge) => ({
        title: badge,
        organization: 'HackerRank',
        url: source.url,
      })),
    }
  },
})
