/**
 * SourceHut.
 *
 * SourceHut's API is GraphQL and requires a personal access token for every query, including
 * reads of public data — there is no anonymous REST surface that lists a user's repositories.
 * Asking every portfolio owner to mint a token for data that is already public on the page
 * would be a poor trade, and token custody is a separate architectural problem.
 *
 * So this contributes the verified profile link. Probed 2026-09-08: `git.sr.ht/~user` serves
 * HTML only, and `rss.xml` on a profile is a 404.
 *
 * @module connectors/sourcehut
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'sourcehut',
  name: 'SourceHut',
  category: 'code',
  icon: 'GitBranch',
  availability: 'url-only',
  homepage: 'https://sr.ht',
  summary: 'Profile link to your SourceHut account.',
  limits:
    'Link only. SourceHut\'s API is GraphQL and requires a personal access token even to read ' +
    'public data, so there is no anonymous route that lists your repositories.',
  supportedData: ['socials'],
  socialKey: 'sourcehut',
  urlFor: (username) => `https://sr.ht/~${String(username).replace(/^~/, '')}`,
  urlPattern: /(?:git\.|meta\.)?sr\.ht\/~([^/?#]+)/i,
})
