/**
 * What each connector can actually do, as data.
 *
 * The alternative is platform knowledge spread through the interface — `if (github) … if
 * (linkedin) … if (scholar) …` — which is tolerable at five integrations and unmaintainable
 * at fifty. Every one of those branches is a place a new connector gets forgotten.
 *
 * So the UI asks this module instead of knowing anything about platforms:
 *
 *     connector declarations  →  capabilities  →  onboarding UI
 *                                             →  connection strategy
 *                                             →  health model
 *
 * Almost everything here is *derived* from what a connector already declares. A connector
 * author states availability, fields and limits once; the wizard, the Connect screen, the
 * catalogue and the docs all follow without further work.
 *
 * @module core/sources/capabilities
 */

import { CONNECTORS, getConnector } from '../../connectors/index.js'
import { methodsFor, methodInfo } from './methods.js'
import { recognisedPlatforms } from './detect.js'

/**
 * Readable names for the profile collections a connector can populate.
 *
 * Derived from `supportedData` rather than restated per platform: a connector's own
 * `summary` already carries the specific detail, and duplicating it here would be one more
 * thing to keep in sync.
 */
const DATA_LABELS = {
  identity: 'Profile',
  socials: 'Links',
  projects: 'Projects',
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education',
  achievements: 'Achievements',
  certifications: 'Certifications',
  publications: 'Publications',
  posts: 'Writing',
  packages: 'Packages',
  models: 'Models & datasets',
  videos: 'Videos',
  hackathons: 'Hackathons',
  talks: 'Talks',
  competitive: 'Competitive programming',
  languages: 'Languages',
  stats: 'Statistics',
  '*': 'Anything you provide',
}

/**
 * Platforms offered before a user has to go looking.
 *
 * Curation, not capability — which is why it lives in this layer rather than in a component.
 * Chosen to span the personas the project serves (engineer, researcher, competitor,
 * builder, writer) so that most people find themselves in the first row.
 */
const FEATURED = [
  'github', 'linkedin', 'orcid', 'leetcode',
  'kaggle', 'devpost', 'googleScholar', 'huggingface',
  'medium', 'stackoverflow', 'npm', 'codeforces',
]

/**
 * @typedef {object} Capabilities
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} category
 * @property {string} summary
 * @property {string} [limits]
 * @property {import('./methods.js').ConnectionMethod[]} methods
 * @property {import('./methods.js').ConnectionMethod} bestMethod
 * @property {'none'|'optional'|'required'} authentication
 * @property {string[]} authEnv
 * @property {string[]} data              Readable labels of what it can populate.
 * @property {boolean} refresh            Whether re-running the import does anything.
 * @property {{known: boolean, note?: string}} rateLimit
 * @property {{key: string, label: string, required: boolean, placeholder?: string, help?: string}[]} identifiers
 * @property {boolean} detectable         Whether a pasted URL configures it.
 * @property {string} [urlExample]
 * @property {boolean} featured
 * @property {number} order
 */

/**
 * Describe one connector.
 *
 * @param {import('../../connectors/types.js').Connector} connector
 * @returns {Capabilities}
 */
export function capabilitiesOf(connector) {
  const methods = methodsFor(connector)
  const detection = recognisedPlatforms().find((p) => p.connector === connector.id)
  const featuredIndex = FEATURED.indexOf(connector.id)

  return {
    id: connector.id,
    name: connector.name,
    icon: connector.icon,
    category: connector.category,
    summary: connector.summary,
    limits: connector.limits,

    methods,
    bestMethod: methods.find((m) => methodInfo(m)?.available) ?? 'manual',

    // `token` means the API returns nothing at all without a credential; anything else with
    // an `authEnv` merely works better with one. Collapsing the two would send people
    // hunting for keys they do not need.
    authentication: connector.availability === 'token'
      ? 'required'
      : connector.authEnv?.length ? 'optional' : 'none',
    authEnv: connector.authEnv ?? [],

    data: (connector.supportedData ?? []).map((key) => DATA_LABELS[key] ?? key),

    refresh: typeof connector.fetch === 'function',
    rateLimit: connector.rateLimit
      ? { known: true, note: connector.rateLimit }
      : { known: false },

    identifiers: (connector.fields ?? [])
      .filter((field) => field.key !== 'data')
      .map((field) => ({
        key: field.key,
        label: field.label,
        required: Boolean(field.required),
        placeholder: field.placeholder,
        help: field.help,
      })),

    detectable: Boolean(detection),
    urlExample: detection?.example,

    featured: featuredIndex !== -1,
    order: featuredIndex === -1 ? FEATURED.length : featuredIndex,
  }
}

/**
 * Every connector's capabilities, featured first.
 *
 * @returns {Capabilities[]}
 */
export function allCapabilities() {
  return CONNECTORS.map(capabilitiesOf).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * The platforms to offer up front.
 *
 * @param {number} [limit]
 * @returns {Capabilities[]}
 */
export function featuredCapabilities(limit = FEATURED.length) {
  return allCapabilities().filter((c) => c.featured).slice(0, limit)
}

/** @param {string} id @returns {Capabilities|undefined} */
export function capabilitiesFor(id) {
  const connector = getConnector(id)
  return connector ? capabilitiesOf(connector) : undefined
}

/**
 * A one-line answer to "what will connecting this actually do?", in the user's terms.
 *
 * The words deliberately describe outcomes rather than mechanisms: someone deciding whether
 * to connect Medium does not care that it is an RSS feed, only that it will pull in their
 * articles without further work.
 *
 * @param {Capabilities} capabilities
 * @returns {string}
 */
export function describeCapability(capabilities) {
  // Named from the connector's own field rather than assumed to be a username: ORCID wants
  // an iD, Stack Overflow a numeric id, dblp a person id. Telling someone to enter a
  // username they do not have is a small lie that costs them a support search.
  const identifier = capabilities.identifiers.find((i) => i.required)?.label.toLowerCase()

  switch (capabilities.bestMethod) {
    case 'api':
      return capabilities.authentication === 'required'
        ? 'Imports automatically once you add a credential.'
        : identifier
          ? `Imports automatically — just your ${identifier}.`
          : 'Imports automatically.'
    case 'endpoint':
      return 'Imports automatically from your public feed.'
    case 'profile-url':
      return 'Adds a verified link. This platform publishes nothing that can be read.'
    case 'upload':
      return 'Imports from a file you export from the platform.'
    default:
      return 'You supply the details; they are attributed and linked.'
  }
}

export { DATA_LABELS, FEATURED }
