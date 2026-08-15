/**
 * ResearchGate.
 *
 * No public API, and automated access is blocked. Contributes the profile link; use
 * `orcid`, `semanticScholar` or `dblp` for the publications themselves.
 *
 * @module connectors/researchgate
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'researchgate',
  name: 'ResearchGate',
  category: 'research',
  icon: 'BookOpen',
  availability: 'url-only',
  homepage: 'https://www.researchgate.net',
  summary: 'Profile link.',
  limits:
    'Link only. ResearchGate has no public API and blocks automated access. Enable `orcid`, ' +
    '`semanticScholar` or `dblp` to import the publications themselves.',
  supportedData: ['socials'],
  urlFor: (username) => `https://www.researchgate.net/profile/${username}`,
  urlPattern: /researchgate\.net\/profile\/([^/?#]+)/i,
})
