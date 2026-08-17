/**
 * Devpost.
 *
 * Devpost has no documented public API. Hackathon projects are entered here and become
 * first-class `hackathons` records — placement, team role, stack and a link to the
 * submission page, which is public and verifiable.
 *
 * @module connectors/devpost
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'devpost',
  name: 'Devpost',
  category: 'community',
  icon: 'Trophy',
  homepage: 'https://devpost.com',
  summary: 'Hackathon submissions, placements and the stack you built them with.',
  limits:
    'No automatic import — Devpost publishes no documented API. List your hackathons under ' +
    '`data.hackathons`; each submission page is public, so link to it and the result is verifiable.',
  supportedData: ['hackathons', 'projects', 'achievements', 'socials'],
  urlFor: (username) => `https://devpost.com/${username}`,
  urlPattern: /devpost\.com\/([^/?#]+)/i,
})
