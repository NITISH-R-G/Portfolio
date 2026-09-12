/**
 * AtCoder.
 *
 * AtCoder publishes no official API — probed 2026-09-08: profile pages are HTML only. The
 * community API at kenkoooo.com is a third-party mirror rather than something AtCoder
 * maintains, so building on it would make a portfolio depend on a service neither the owner
 * nor AtCoder controls, and break silently when it changes.
 *
 * So this takes the same shape as the other contest platforms here: you supply the figures
 * from your own profile, and they are attributed to AtCoder and linked to it.
 *
 * @module connectors/atcoder
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'atcoder',
  name: 'AtCoder',
  category: 'competitive',
  icon: 'Trophy',
  homepage: 'https://atcoder.jp',
  summary: 'Rating, colour and problems solved, linked to your AtCoder profile.',
  limits:
    'No automatic import. AtCoder has no official API, and the community mirror at ' +
    'kenkoooo.com is not maintained by AtCoder — depending on it would be depending on a ' +
    'third party. Enter your figures; they are shown beside a link a reader can check.',
  supportedData: ['competitive', 'socials'],
  competitive: true,
  platformLabel: 'AtCoder',
  urlFor: (username) => `https://atcoder.jp/users/${username}`,
  urlPattern: /atcoder\.jp\/users\/([^/?#]+)/i,
})
