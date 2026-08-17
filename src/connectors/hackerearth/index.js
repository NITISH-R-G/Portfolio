/**
 * HackerEarth.
 *
 * HackerEarth's public API covers code evaluation only — submitting a program and getting
 * a verdict back. It exposes nothing about a user's profile, challenges or rating.
 *
 * @module connectors/hackerearth
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'hackerearth',
  name: 'HackerEarth',
  category: 'competitive',
  icon: 'Trophy',
  homepage: 'https://www.hackerearth.com',
  summary: 'Challenge results and rating, entered by you and linked to your profile.',
  limits:
    'No automatic import. HackerEarth\'s public API evaluates submitted code; it exposes no ' +
    'profile data. Enter your challenge results here.',
  supportedData: ['competitive', 'achievements', 'socials'],
  competitive: true,
  platformLabel: 'HackerEarth',
  urlFor: (username) => `https://www.hackerearth.com/@${username}`,
  urlPattern: /hackerearth\.com\/@?([^/?#]+)/i,
})
