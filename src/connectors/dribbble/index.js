/**
 * Dribbble.
 *
 * Dribbble's v2 API is OAuth-only and its client registration is restricted to approved
 * applications; there is no anonymous endpoint that returns a user's shots. OAuth token
 * custody needs server infrastructure this project deliberately does not have.
 *
 * @module connectors/dribbble
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'dribbble',
  name: 'Dribbble',
  category: 'design',
  icon: 'Dribbble',
  availability: 'url-only',
  homepage: 'https://dribbble.com',
  summary: 'Profile link to your Dribbble shots.',
  limits:
    'Link only. Dribbble\'s API is OAuth-only with restricted client registration, and this ' +
    'project has nowhere to hold a token.',
  supportedData: ['socials'],
  socialKey: 'dribbble',
  urlFor: (username) => `https://dribbble.com/${username}`,
  urlPattern: /dribbble\.com\/([^/?#]+)/i,
})
