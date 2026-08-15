/**
 * The connector registry.
 *
 * Every connector is registered here and nowhere else. The setup wizard, the import
 * script, the admin builder and the documentation generator all read this list, so adding
 * a platform means adding one directory and one line — no UI, no config schema and no CLI
 * needs to change. That is the extensibility guarantee described in
 * docs/adding-a-connector.md.
 *
 * @module connectors
 */

import github from './github/index.js'
import gitlab from './gitlab/index.js'
import bitbucket from './bitbucket/index.js'
import dockerhub from './dockerhub/index.js'
import npm from './npm/index.js'
import pypi from './pypi/index.js'
import huggingface from './huggingface/index.js'
import kaggle from './kaggle/index.js'
import leetcode from './leetcode/index.js'
import codeforces from './codeforces/index.js'
import codechef from './codechef/index.js'
import hackerrank from './hackerrank/index.js'
import hackerearth from './hackerearth/index.js'
import stackoverflow from './stackoverflow/index.js'
import orcid from './orcid/index.js'
import semanticScholar from './semantic-scholar/index.js'
import dblp from './dblp/index.js'
import googleScholar from './google-scholar/index.js'
import researchgate from './researchgate/index.js'
import medium from './medium/index.js'
import substack from './substack/index.js'
import hashnode from './hashnode/index.js'
import devto from './devto/index.js'
import website from './website/index.js'
import youtube from './youtube/index.js'
import devpost from './devpost/index.js'
import linkedin from './linkedin/index.js'
import x from './x/index.js'
import custom from './custom/index.js'

/**
 * Ordered so that the setup wizard offers the highest-value, lowest-friction sources
 * first: things that import fully with nothing but a username, before things that need a
 * key, before things the user has to type.
 *
 * @type {import('./types.js').Connector[]}
 */
export const CONNECTORS = [
  github, gitlab, bitbucket, dockerhub,
  npm, pypi, huggingface, kaggle,
  leetcode, codeforces, codechef, hackerrank, hackerearth,
  stackoverflow,
  orcid, semanticScholar, dblp, googleScholar, researchgate,
  medium, substack, hashnode, devto, website, youtube,
  devpost, linkedin, x,
  custom,
]

/** @type {Map<string, import('./types.js').Connector>} */
const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]))

/**
 * Look up a connector by the key used under `dataSources`.
 *
 * Keys are matched exactly first, then by longest matching prefix, so a user can configure
 * several instances of a generic connector — `custom`, `customBehance`, `website2` — without
 * the registry needing to know about them in advance.
 *
 * @param {string} id
 * @returns {import('./types.js').Connector|undefined}
 */
export function getConnector(id) {
  if (BY_ID.has(id)) return BY_ID.get(id)
  let best
  for (const connector of CONNECTORS) {
    if (!id.startsWith(connector.id)) continue
    // The remainder must be a suffix, not the middle of another connector's name.
    if (!best || connector.id.length > best.id.length) best = connector
  }
  return best
}

/**
 * @param {import('./types.js').ConnectorCategory} category
 * @returns {import('./types.js').Connector[]}
 */
export function connectorsByCategory(category) {
  return CONNECTORS.filter((c) => c.category === category)
}

/**
 * The categories present, in display order, each with its connectors. Drives the grouping
 * in `npm run setup` and in the admin's Sources panel.
 *
 * @returns {{category: string, label: string, connectors: import('./types.js').Connector[]}[]}
 */
export function connectorGroups() {
  /** @type {[string, string][]} */
  const labels = [
    ['code', 'Code'],
    ['packages', 'Packages & registries'],
    ['ml', 'Models & data'],
    ['competitive', 'Competitive programming'],
    ['research', 'Research'],
    ['writing', 'Writing'],
    ['video', 'Video'],
    ['community', 'Community'],
    ['social', 'Social'],
    ['other', 'Other'],
  ]
  return labels
    .map(([category, label]) => ({ category, label, connectors: connectorsByCategory(/** @type {any} */ (category)) }))
    .filter((group) => group.connectors.length)
}

/**
 * Which `dataSources` entries in a config actually resolve to something runnable.
 *
 * Reports unknown keys rather than ignoring them: a typo like `githib: {...}` otherwise
 * manifests as a source that mysteriously never imports.
 *
 * @param {Record<string, Record<string, unknown>>} dataSources
 * @returns {{
 *   sources: {key: string, connector: import('./types.js').Connector, config: Record<string, unknown>}[],
 *   unknown: string[],
 * }}
 */
export function resolveDataSources(dataSources) {
  const sources = []
  const unknown = []

  for (const [key, config] of Object.entries(dataSources ?? {})) {
    if (!config || typeof config !== 'object') continue
    const connector = getConnector(key)
    if (!connector) {
      unknown.push(key)
      continue
    }
    sources.push({ key, connector, config })
  }

  return { sources, unknown }
}

/**
 * Whether a source is configured well enough to attempt. Used by the import script to
 * report `skipped` with a specific reason instead of failing mid-fetch.
 *
 * @param {import('./types.js').Connector} connector
 * @param {Record<string, unknown>} config
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function checkSource(connector, config) {
  if (config.enabled === false) return { ok: false, reason: 'Disabled in portfolio.config.js.' }

  const account = connector.identify?.(config)
  if (!account) {
    const required = connector.fields.filter((f) => f.required).map((f) => f.key)
    return {
      ok: false,
      reason: required.length
        ? `Not configured — ${connector.name} needs ${required.map((r) => `\`${r}\``).join(' and ')}.`
        : `Not configured — no identifier or profile URL was given for ${connector.name}.`,
    }
  }
  return { ok: true }
}

export { getConnector as connector }
