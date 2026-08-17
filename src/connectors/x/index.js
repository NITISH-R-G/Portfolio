/**
 * X (formerly Twitter).
 *
 * The X API has no free tier that returns a user's posts or profile metrics, so there is
 * no route that works for a clone-and-run open-source project. This contributes the
 * profile link and the `twitter:creator` handle used in card metadata.
 *
 * @module connectors/x
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'x',
  name: 'X (Twitter)',
  category: 'social',
  icon: 'Twitter',
  availability: 'url-only',
  homepage: 'https://x.com',
  summary: 'Profile link, and the handle used for Twitter Card metadata.',
  limits:
    'Link only. The X API has no free tier that returns profile or post data. Set the same ' +
    'handle as `seo.twitterHandle` so shared links render an attributed card.',
  supportedData: ['socials'],
  socialKey: 'x',
  urlFor: (username) => `https://x.com/${username}`,
  urlPattern: /(?:x|twitter)\.com\/([^/?#]+)/i,
})
