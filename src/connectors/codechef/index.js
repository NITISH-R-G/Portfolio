/**
 * CodeChef.
 *
 * CodeChef retired its public developer API and the current site is rendered behind bot
 * protection. Rating, stars and contest counts are typed by the user and linked to the
 * profile page, which is where a reader verifies them.
 *
 * @module connectors/codechef
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'codechef',
  name: 'CodeChef',
  category: 'competitive',
  icon: 'Trophy',
  homepage: 'https://www.codechef.com',
  summary: 'Rating, star level, contests and problems solved, linked to your CodeChef profile.',
  limits:
    'No automatic import. CodeChef retired its public API. Enter your figures here — they ' +
    'are shown alongside a link to your profile so a reader can check them.',
  supportedData: ['competitive', 'socials'],
  competitive: true,
  platformLabel: 'CodeChef',
  urlFor: (username) => `https://www.codechef.com/users/${username}`,
  urlPattern: /codechef\.com\/users\/([^/?#]+)/i,
  fields: [
    { key: 'stars', label: 'Star level', type: 'number', help: '1–7. Rendered as "5★" when no explicit rank is set.' },
  ],
})
