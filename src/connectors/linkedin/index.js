/**
 * LinkedIn.
 *
 * LinkedIn's public API grants third-party applications no access to profile data, and
 * their User Agreement prohibits automated collection from profile pages. There is no
 * honest way to fetch this, so this connector does not pretend to.
 *
 * The supported path is the one LinkedIn itself provides: every member can export their
 * own data (Settings → Data privacy → Get a copy of your data). `npm run import:file`
 * reads that archive and turns Positions.csv, Education.csv and Skills.csv into schema
 * records. This connector then supplies the verified profile link and anything the user
 * chooses to type.
 *
 * @module connectors/linkedin
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'linkedin',
  name: 'LinkedIn',
  category: 'social',
  icon: 'Linkedin',
  homepage: 'https://www.linkedin.com',
  summary: 'Profile link, plus experience and education from your own LinkedIn data export.',
  limits:
    'No automatic import. LinkedIn does not expose profile data to third-party applications ' +
    'and prohibits automated access to profile pages. Use your own data export with ' +
    '`npm run import:file -- <path-to-export.zip>`, or type the fields here.',
  supportedData: ['experience', 'education', 'skills', 'socials'],
  urlFor: (username) => `https://www.linkedin.com/in/${username}`,
  urlPattern: /linkedin\.com\/in\/([^/?#]+)/i,
})
