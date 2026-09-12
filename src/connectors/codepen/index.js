/**
 * CodePen.
 *
 * CodePen has no public API, and the RSS paths that once existed no longer resolve — probed
 * 2026-09-08: `/{user}/public/feed`, `/public/feed/` and `/public/rss` all return 404 HTML.
 * The pen pages themselves are public and worth linking to.
 *
 * @module connectors/codepen
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'codepen',
  name: 'CodePen',
  category: 'design',
  icon: 'Codepen',
  availability: 'url-only',
  homepage: 'https://codepen.io',
  summary: 'Profile link to your CodePen pens.',
  limits:
    'Link only. CodePen publishes no API, and the profile RSS feeds it used to serve now ' +
    'return 404.',
  supportedData: ['socials'],
  socialKey: 'codepen',
  urlFor: (username) => `https://codepen.io/${username}`,
  urlPattern: /codepen\.io\/([^/?#]+)/i,
})
