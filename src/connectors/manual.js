/**
 * Factory for connectors that cannot fetch.
 *
 * Several platforms a technical portfolio genuinely needs — LinkedIn, HackerRank,
 * HackerEarth, CodeChef, Devpost, Google Scholar, ResearchGate — publish no usable public
 * API, and reaching their data anyway would mean scraping pages that their terms forbid
 * and their bot protection is designed to stop. Building that would produce an integration
 * that breaks silently and puts the user at risk.
 *
 * So this project does the other thing: it says so. A manual connector still gives the
 * user a real integration — a verified profile link, a typed set of figures that lands in
 * the same normalized schema as everything else, provenance attribution, and a place in
 * the setup wizard — it simply never claims the numbers were fetched. `npm run import`
 * reports it as `manual`, not `imported`, and the admin shows the distinction.
 *
 * @module connectors/manual
 */

import { clean, count, list, some, handle } from './support.js'
import { normalizeProfile } from '../core/schema/profile.js'

/**
 * Fields every manual connector accepts, so the shape is predictable across platforms.
 * @type {import('./types.js').ConnectorField[]}
 */
const COMMON_FIELDS = [
  { key: 'profileUrl', label: 'Profile URL', type: 'url', help: 'Linked from your portfolio and used for attribution.' },
]

/**
 * @typedef {object} ManualSpec
 * @property {string} id
 * @property {string} name
 * @property {import('./types.js').ConnectorCategory} category
 * @property {string} icon
 * @property {string} homepage
 * @property {string} summary
 * @property {string} limits              Why it cannot fetch. Shown to the user verbatim.
 * @property {string[]} supportedData
 * @property {'manual'|'url-only'} [availability]
 * @property {string|((cfg: Record<string, unknown>) => string)} [socialKey]
 *   Key under `profile.socials`. Defaults to `id`. A function lets a generic connector
 *   name itself from config, so two "custom" sources do not overwrite each other's link.
 * @property {(username: string) => string} [urlFor]
 * @property {RegExp} [urlPattern}        Extracts a handle from a pasted profile URL.
 * @property {import('./types.js').ConnectorField[]} [fields]
 * @property {string} [platformLabel]     Display name for a competitive-programming entry.
 * @property {boolean} [competitive}      Accept rating/problemsSolved/contests/rank/stars.
 * @property {(cfg: Record<string, unknown>, source: {connector: string, url?: string}) => object|undefined} [extra]
 *   Maps platform-specific config shorthand into schema records. Lets a manual connector
 *   offer fields that read naturally ("badges") without every user learning the full schema.
 */

/**
 * @param {ManualSpec} spec
 * @returns {import('./types.js').Connector}
 */
export function defineManualConnector(spec) {
  const availability = spec.availability ?? 'manual'

  /** @param {Record<string, unknown>} cfg */
  const socialKeyFor = (cfg) => {
    const key = typeof spec.socialKey === 'function' ? spec.socialKey(cfg) : spec.socialKey
    return key || spec.id
  }

  /** @param {Record<string, unknown>} cfg */
  const identify = (cfg) => {
    const user = handle(cfg, ['username', 'user', 'handle', 'id'], spec.urlPattern)
    if (user) return user
    // A URL alone is enough to configure a manual connector — there is nothing to look up.
    const url = typeof cfg?.profileUrl === 'string' ? cfg.profileUrl.trim() : ''
    if (!url) return undefined
    const extracted = spec.urlPattern?.exec(url)?.[1]
    return extracted ? decodeURIComponent(extracted) : url
  }

  /** @param {Record<string, unknown>} cfg */
  const profileUrl = (cfg) => {
    const explicit = typeof cfg?.profileUrl === 'string' ? cfg.profileUrl.trim() : ''
    if (explicit && /^https?:\/\//i.test(explicit)) return explicit
    const user = handle(cfg, ['username', 'user', 'handle', 'id'], spec.urlPattern)
    return user && spec.urlFor ? spec.urlFor(user) : undefined
  }

  /** @type {import('./types.js').Connector} */
  const connector = {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    icon: spec.icon,
    availability,
    homepage: spec.homepage,
    summary: spec.summary,
    limits: spec.limits,
    supportedData: spec.supportedData,
    fields: [
      ...(spec.urlFor ? [{ key: 'username', label: `${spec.name} username`, type: /** @type {const} */ ('string') }] : []),
      ...COMMON_FIELDS,
      ...(spec.competitive ? COMPETITIVE_FIELDS : []),
      ...(spec.fields ?? []),
      ...(availability === 'manual' ? [DATA_FIELD] : []),
    ],
    identify,
    profileUrl,

    normalize(_raw, cfg) {
      const url = profileUrl(cfg)
      const source = clean({ connector: spec.id, url })

      // `data` is a full Profile-shaped object, so a manual source can contribute anything
      // the schema supports — the same records a fetching connector would produce, just
      // typed by the user. Normalizing it here means the same validation applies.
      const typed = normalizeProfile(mergeShorthand(cfg.data, spec.extra?.(cfg, source)))
      const withProvenance = attribute(typed, source)

      const competitive = spec.competitive ? competitiveEntry(spec, cfg, url, source) : undefined

      return clean({
        ...withProvenance,
        socials: clean({ ...(withProvenance.socials ?? {}), [socialKeyFor(cfg)]: url }),
        competitive: some([...(withProvenance.competitive ?? []), competitive]),
        meta: { connectors: [spec.id] },
      })
    },
  }

  return connector
}

/** Numeric fields shared by every competitive-programming platform. */
/** @type {import('./types.js').ConnectorField[]} */
const COMPETITIVE_FIELDS = [
  { key: 'rating', label: 'Current rating', type: 'number' },
  { key: 'maxRating', label: 'Peak rating', type: 'number' },
  { key: 'rank', label: 'Rank or title', type: 'string', placeholder: 'e.g. 4★, Expert, Gold' },
  { key: 'problemsSolved', label: 'Problems solved', type: 'number' },
  { key: 'contests', label: 'Contests entered', type: 'number' },
  { key: 'globalRank', label: 'Global rank', type: 'number' },
]

/** @type {import('./types.js').ConnectorField} */
const DATA_FIELD = {
  key: 'data',
  label: 'Profile data',
  help:
    'Any part of the portfolio schema — projects, achievements, certifications, ' +
    'publications, experience. Everything under this key is attributed to this platform.',
}

/**
 * Combine the user's raw `data` block with whatever the connector's shorthand expanded
 * into, concatenating same-named collections so neither source silently wins.
 *
 * @param {unknown} data
 * @param {object|undefined} expanded
 * @returns {Record<string, unknown>}
 */
function mergeShorthand(data, expanded) {
  const base = data && typeof data === 'object' && !Array.isArray(data)
    ? { .../** @type {Record<string, unknown>} */ (data) }
    : {}
  if (!expanded) return base
  for (const [key, value] of Object.entries(expanded)) {
    if (value === undefined) continue
    const existing = base[key]
    base[key] = Array.isArray(existing) && Array.isArray(value) ? [...existing, ...value] : value
  }
  return base
}

/**
 * @param {ManualSpec} spec
 * @param {Record<string, unknown>} cfg
 * @param {string|undefined} url
 * @param {{connector: string, url?: string}} source
 */
function competitiveEntry(spec, cfg, url, source) {
  const entry = clean({
    platform: spec.platformLabel ?? spec.name,
    connector: spec.id,
    username: handle(cfg, ['username', 'user', 'handle'], spec.urlPattern),
    url,
    rating: count(cfg.rating),
    maxRating: count(cfg.maxRating),
    rank: typeof cfg.rank === 'string' ? cfg.rank : (count(cfg.stars) !== undefined ? `${count(cfg.stars)}★` : undefined),
    problemsSolved: count(cfg.problemsSolved),
    contests: count(cfg.contests),
    globalRank: count(cfg.globalRank),
    source,
  })
  // Only worth a record if the user actually supplied something beyond the handle.
  const substantive = ['rating', 'maxRating', 'rank', 'problemsSolved', 'contests', 'globalRank']
  return substantive.some((key) => entry[key] !== undefined) ? entry : undefined
}

/**
 * Stamp every record in a profile with the connector it came from, unless it already
 * carries its own attribution.
 *
 * @param {import('../core/schema/types.js').Profile} profile
 * @param {{connector: string, url?: string}} source
 */
function attribute(profile, source) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [key, value] of Object.entries(profile)) {
    if (!Array.isArray(value)) {
      out[key] = value
      continue
    }
    out[key] = value.map((record) =>
      record && typeof record === 'object' && !('source' in record)
        ? { ...record, source }
        : record)
  }
  return /** @type {any} */ (out)
}

export { list }
