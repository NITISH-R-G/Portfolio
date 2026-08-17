/**
 * Custom profile.
 *
 * The escape hatch: any platform this project has no connector for. Give it a label, a
 * URL, and any portfolio data you want attributed to it. Everything under `data` goes
 * through the same schema normalization as fetched data, so a hand-entered project and an
 * imported one are indistinguishable to the rest of the system.
 *
 * Configure several by suffixing the key — `custom`, `custom2`, `customArtstation` — since
 * `dataSources` keys only need to resolve to a connector by prefix.
 *
 * @module connectors/custom
 */

import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'custom',
  name: 'Custom profile',
  category: 'other',
  icon: 'Link',
  homepage: '',
  summary: 'Any platform with no built-in connector. You supply the label, link and data.',
  limits:
    'Nothing is fetched — this is a labelled container for data you provide. If the platform ' +
    'does have a public API, a real connector is about eighty lines: see docs/adding-a-connector.md.',
  supportedData: ['*'],
  // Named from config so several custom sources coexist in the social links map instead of
  // the last one silently replacing the rest.
  socialKey: (cfg) => (typeof cfg.label === 'string' && cfg.label.trim() ? cfg.label.trim() : 'custom'),
  fields: [
    { key: 'label', label: 'Platform name', required: true, placeholder: 'Behance' },
  ],
})
