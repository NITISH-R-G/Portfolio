/**
 * Behance.
 *
 * Adobe closed the public Behance API in 2020; what remains is partner-only and requires an
 * approved application. The profile pages are public HTML, which is a link rather than an
 * import — reconstructing projects from that markup would be a scrape that breaks whenever
 * Adobe reorganises the page.
 *
 * @module connectors/behance
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'behance',
  name: 'Behance',
  category: 'design',
  icon: 'Palette',
  availability: 'url-only',
  homepage: 'https://www.behance.net',
  summary: 'Profile link to your Behance portfolio.',
  limits:
    'Link only. Adobe retired the public Behance API in 2020 and the replacement is limited ' +
    'to approved partners.',
  supportedData: ['socials'],
  socialKey: 'behance',
  urlFor: (username) => `https://www.behance.net/${username}`,
  urlPattern: /behance\.net\/([^/?#]+)/i,
})
